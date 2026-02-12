"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { ChatMessage } from "./chat-message";

const transport = new DefaultChatTransport({ api: "/api/chat" });

/** Imperative handle for parent-driven session control (main page). */
export type ChatPanelHandle = {
	loadSession: (sessionId: string) => Promise<void>;
	newSession: () => Promise<void>;
};

export type FileContext = {
	path: string;
	filename: string;
};

type FileScopedSession = {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
};

type ChatPanelProps = {
	/** When set, scopes sessions to this file and prepends content as context. */
	fileContext?: FileContext;
	/** Compact mode for workspace sidebar (smaller UI, built-in session tabs). */
	compact?: boolean;
	/** Called when file content may have changed after agent edits. */
	onFileChanged?: (newContent: string) => void;
	/** Called when active session changes (for external sidebar highlighting). */
	onActiveSessionChange?: (sessionId: string | null) => void;
	/** Called when session list needs refresh (for external sidebar). */
	onSessionsChange?: () => void;
};

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
	function ChatPanel(
		{
			fileContext,
			compact,
			onFileChanged,
			onActiveSessionChange,
			onSessionsChange,
		},
		ref,
	) {
		const { messages, sendMessage, status, stop, error, setMessages } =
			useChat({ transport });
		const [input, setInput] = useState("");
		const [currentSessionId, setCurrentSessionId] = useState<string | null>(
			null,
		);
		const [loadingSession, setLoadingSession] = useState(false);
		const [startingNewSession, setStartingNewSession] = useState(false);
		const messagesEndRef = useRef<HTMLDivElement>(null);

		// Track persisted messages to avoid double-saves
		const savedMessageIdsRef = useRef<Set<string>>(new Set());
		// Set when /new or + triggers a new session
		const newSessionPendingRef = useRef(false);
		// Whether the next message should include file context
		const isFirstFileMessageRef = useRef(true);

		// File-scoped session list (compact mode only)
		const [fileSessions, setFileSessions] = useState<FileScopedSession[]>(
			[],
		);

		const filePath = fileContext?.path ?? null;
		const isStreaming = status === "streaming" || status === "submitted";

		// Auto-scroll to bottom on new messages
		useEffect(() => {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}, [messages]);

		// ── File-scoped sessions ──

		const fetchFileSessions = useCallback(async () => {
			if (!filePath) {return;}
			try {
				const res = await fetch(
					`/api/web-sessions?filePath=${encodeURIComponent(filePath)}`,
				);
				const data = await res.json();
				setFileSessions(data.sessions || []);
			} catch {
				// ignore
			}
		}, [filePath]);

		useEffect(() => {
			if (filePath) {fetchFileSessions();}
		}, [filePath, fetchFileSessions]);

		// Reset chat state when the active file changes
		useEffect(() => {
			if (!filePath) {return;}
			stop();
			setCurrentSessionId(null);
			onActiveSessionChange?.(null);
			setMessages([]);
			savedMessageIdsRef.current.clear();
			isFirstFileMessageRef.current = true;
			// eslint-disable-next-line react-hooks/exhaustive-deps -- stable setters
		}, [filePath]);

		// ── Session persistence ──

		const saveMessages = useCallback(
			async (
				sessionId: string,
				msgs: Array<{
					id: string;
					role: string;
					content: string;
					parts?: unknown[];
				}>,
				title?: string,
			) => {
				const toSave = msgs.map((m) => ({
					id: m.id,
					role: m.role,
					content: m.content,
					...(m.parts ? { parts: m.parts } : {}),
					timestamp: new Date().toISOString(),
				}));
				try {
					await fetch(
						`/api/web-sessions/${sessionId}/messages`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								messages: toSave,
								title,
							}),
						},
					);
					for (const m of msgs)
						{savedMessageIdsRef.current.add(m.id);}
					onSessionsChange?.();
					if (filePath) {fetchFileSessions();}
				} catch (err) {
					console.error("Failed to save messages:", err);
				}
			},
			[onSessionsChange, filePath, fetchFileSessions],
		);

		const createSession = useCallback(
			async (title: string): Promise<string> => {
				const body: Record<string, string> = { title };
				if (filePath) {body.filePath = filePath;}
				const res = await fetch("/api/web-sessions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				const data = await res.json();
				return data.session.id;
			},
			[filePath],
		);

		/** Extract plain text from a UIMessage */
		const getMessageText = useCallback(
			(msg: (typeof messages)[number]): string => {
				return (
					msg.parts
						?.filter(
							(
								p,
							): p is {
								type: "text";
								text: string;
							} => p.type === "text",
						)
						.map((p) => p.text)
						.join("\n") ?? ""
				);
			},
			[],
		);

		// Persist unsaved messages when streaming finishes + live-reload file
		const prevStatusRef = useRef(status);
		useEffect(() => {
			const wasStreaming =
				prevStatusRef.current === "streaming" ||
				prevStatusRef.current === "submitted";
			const isNowReady = status === "ready";

			if (wasStreaming && isNowReady && currentSessionId) {
				const unsaved = messages.filter(
					(m) => !savedMessageIdsRef.current.has(m.id),
				);
				if (unsaved.length > 0) {
					const toSave = unsaved.map((m) => ({
						id: m.id,
						role: m.role,
						content: getMessageText(m),
						parts: m.parts,
					}));
					saveMessages(currentSessionId, toSave);
				}

				// Re-fetch file content for live reload after agent edits
				if (filePath && onFileChanged) {
					fetch(
						`/api/workspace/file?path=${encodeURIComponent(filePath)}`,
					)
						.then((r) => r.json())
						.then((data) => {
							if (data.content) {onFileChanged(data.content);}
						})
						.catch(() => {});
				}
			}
			prevStatusRef.current = status;
		}, [
			status,
			messages,
			currentSessionId,
			saveMessages,
			getMessageText,
			filePath,
			onFileChanged,
		]);

		// ── Actions ──

		const handleSubmit = async (e: React.FormEvent) => {
			e.preventDefault();
			if (!input.trim() || isStreaming) {return;}

			const userText = input.trim();
			setInput("");

			if (userText.toLowerCase() === "/new") {
				handleNewSession();
				return;
			}

			// Create session if none
			let sessionId = currentSessionId;
			if (!sessionId) {
				const title =
					userText.length > 60
						? userText.slice(0, 60) + "..."
						: userText;
				sessionId = await createSession(title);
				setCurrentSessionId(sessionId);
				onActiveSessionChange?.(sessionId);
				onSessionsChange?.();
				if (filePath) {fetchFileSessions();}

				if (newSessionPendingRef.current) {
					newSessionPendingRef.current = false;
					const newMsgId = `system-new-${Date.now()}`;
					await saveMessages(sessionId, [
						{
							id: newMsgId,
							role: "user",
							content: "/new",
							parts: [{ type: "text", text: "/new" }],
						},
					]);
				}
			}

			// Prepend file path context for the first message in a file-scoped session
			let messageText = userText;
			if (fileContext && isFirstFileMessageRef.current) {
				messageText = `[Context: workspace file '${fileContext.path}']\n\n${userText}`;
				isFirstFileMessageRef.current = false;
			}

			sendMessage({ text: messageText });
		};

		const handleSessionSelect = useCallback(
			async (sessionId: string) => {
				if (sessionId === currentSessionId) {return;}

				setLoadingSession(true);
				setCurrentSessionId(sessionId);
				onActiveSessionChange?.(sessionId);
				savedMessageIdsRef.current.clear();
				isFirstFileMessageRef.current = false; // loaded session has context

				try {
					const response = await fetch(
						`/api/web-sessions/${sessionId}`,
					);
					if (!response.ok)
						{throw new Error("Failed to load session");}

					const data = await response.json();
					const sessionMessages: Array<{
						id: string;
						role: "user" | "assistant";
						content: string;
						parts?: Array<Record<string, unknown>>;
					}> = data.messages || [];

					const uiMessages = sessionMessages.map((msg) => {
						savedMessageIdsRef.current.add(msg.id);
						return {
							id: msg.id,
							role: msg.role,
							parts: (msg.parts ?? [
								{
									type: "text" as const,
									text: msg.content,
								},
							]) as UIMessage["parts"],
						};
					});

					setMessages(uiMessages);
				} catch (err) {
					console.error("Error loading session:", err);
				} finally {
					setLoadingSession(false);
				}
			},
			[currentSessionId, setMessages, onActiveSessionChange],
		);

		const handleNewSession = useCallback(async () => {
			setCurrentSessionId(null);
			onActiveSessionChange?.(null);
			setMessages([]);
			savedMessageIdsRef.current.clear();
			isFirstFileMessageRef.current = true;
			newSessionPendingRef.current = true;

			// Only send /new to backend for non-file sessions (main chat)
			if (!filePath) {
				setStartingNewSession(true);
				try {
					await fetch("/api/new-session", { method: "POST" });
				} catch (err) {
					console.error("Failed to send /new:", err);
				} finally {
					setStartingNewSession(false);
				}
			}
		}, [setMessages, onActiveSessionChange, filePath]);

		// Expose imperative handle for parent-driven session management
		useImperativeHandle(
			ref,
			() => ({
				loadSession: handleSessionSelect,
				newSession: handleNewSession,
			}),
			[handleSessionSelect, handleNewSession],
		);

		// ── Status label ──

		const statusLabel = startingNewSession
			? "Starting new session..."
			: loadingSession
				? "Loading session..."
				: status === "ready"
					? "Ready"
					: status === "submitted"
						? "Thinking..."
						: status === "streaming"
							? "Streaming..."
							: status === "error"
								? "Error"
								: status;

		// ── Render ──

		return (
			<div className="flex flex-col h-full">
				{/* Header */}
				<header
					className={`${compact ? "px-3 py-2" : "px-6 py-3"} border-b flex items-center justify-between flex-shrink-0`}
					style={{
						borderColor: "var(--color-border)",
						background: "var(--color-surface)",
					}}
				>
					<div className="min-w-0 flex-1">
						{compact && fileContext ? (
							<>
								<h2
									className="text-xs font-semibold truncate"
									style={{
										color: "var(--color-text)",
									}}
								>
									Chat: {fileContext.filename}
								</h2>
								<p
									className="text-[10px]"
									style={{
										color: "var(--color-text-muted)",
									}}
								>
									{statusLabel}
								</p>
							</>
						) : (
							<>
								<h2 className="text-sm font-semibold">
									{currentSessionId
										? "Chat Session"
										: "New Chat"}
								</h2>
								<p
									className="text-xs"
									style={{
										color: "var(--color-text-muted)",
									}}
								>
									{statusLabel}
								</p>
							</>
						)}
					</div>
					<div className="flex gap-1 flex-shrink-0">
						{compact && (
							<button
								type="button"
								onClick={() => handleNewSession()}
								className="p-1 rounded transition-colors"
								style={{ color: "var(--color-text-muted)" }}
								title="New chat"
								onMouseEnter={(e) => {
									(
										e.currentTarget as HTMLElement
									).style.background =
										"var(--color-surface-hover)";
								}}
								onMouseLeave={(e) => {
									(
										e.currentTarget as HTMLElement
									).style.background = "transparent";
								}}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M12 5v14" />
									<path d="M5 12h14" />
								</svg>
							</button>
						)}
						{isStreaming && (
							<button
								type="button"
								onClick={() => stop()}
								className={`${compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"} rounded-md transition-colors`}
								style={{
									background: "var(--color-border)",
									color: "var(--color-text)",
								}}
							>
								Stop
							</button>
						)}
					</div>
				</header>

				{/* File-scoped session tabs (compact mode) */}
				{compact && fileContext && fileSessions.length > 0 && (
					<div
						className="px-2 py-1.5 border-b flex gap-1 overflow-x-auto flex-shrink-0"
						style={{ borderColor: "var(--color-border)" }}
					>
						{fileSessions.slice(0, 10).map((s) => (
							<button
								key={s.id}
								type="button"
								onClick={() => handleSessionSelect(s.id)}
								className="px-2 py-0.5 text-[10px] rounded-md whitespace-nowrap transition-colors flex-shrink-0"
								style={{
									background:
										s.id === currentSessionId
											? "var(--color-accent)"
											: "var(--color-surface)",
									color:
										s.id === currentSessionId
											? "white"
											: "var(--color-text-muted)",
									border: `1px solid ${s.id === currentSessionId ? "var(--color-accent)" : "var(--color-border)"}`,
								}}
							>
								{s.title.length > 25
									? s.title.slice(0, 25) + "..."
									: s.title}
							</button>
						))}
					</div>
				)}

				{/* Messages */}
				<div
					className={`flex-1 overflow-y-auto ${compact ? "px-3" : "px-6"}`}
				>
					{loadingSession ? (
						<div className="flex items-center justify-center h-full">
							<div className="text-center">
								<div
									className="w-6 h-6 border-2 rounded-full animate-spin mx-auto mb-3"
									style={{
										borderColor:
											"var(--color-border)",
										borderTopColor:
											"var(--color-accent)",
									}}
								/>
								<p
									className="text-xs"
									style={{
										color: "var(--color-text-muted)",
									}}
								>
									Loading session...
								</p>
							</div>
						</div>
					) : messages.length === 0 ? (
						<div className="flex items-center justify-center h-full">
							<div className="text-center">
								{compact ? (
									<p
										className="text-sm"
										style={{
											color: "var(--color-text-muted)",
										}}
									>
										Ask about this file
									</p>
								) : (
									<>
										<p className="text-6xl mb-4">
											🦞
										</p>
										<h3 className="text-lg font-semibold mb-1">
											OpenClaw Chat
										</h3>
										<p
											className="text-sm"
											style={{
												color: "var(--color-text-muted)",
											}}
										>
											Send a message to start a
											conversation with your
											agent.
										</p>
									</>
								)}
							</div>
						</div>
					) : (
						<div
							className={`${compact ? "" : "max-w-3xl mx-auto"} py-3`}
						>
							{messages.map((message) => (
								<ChatMessage
									key={message.id}
									message={message}
								/>
							))}
							<div ref={messagesEndRef} />
						</div>
					)}
				</div>

				{/* Error display */}
				{error && (
					<div className="px-3 py-1.5 bg-red-900/20 border-t border-red-800/30 flex-shrink-0">
						<p className="text-xs text-red-400">
							Error: {error.message}
						</p>
					</div>
				)}

				{/* Input */}
				<div
					className={`${compact ? "px-3 py-2" : "px-6 py-4"} border-t flex-shrink-0`}
					style={{
						borderColor: "var(--color-border)",
						background: "var(--color-surface)",
					}}
				>
					<form
						onSubmit={handleSubmit}
						className={`${compact ? "" : "max-w-3xl mx-auto"} flex gap-2`}
					>
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder={
								compact && fileContext
									? `Ask about ${fileContext.filename}...`
									: "Message OpenClaw..."
							}
							disabled={
								isStreaming ||
								loadingSession ||
								startingNewSession
							}
							className={`flex-1 ${compact ? "px-3 py-2 text-xs rounded-lg" : "px-4 py-3 text-sm rounded-xl"} border focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent disabled:opacity-50`}
							style={{
								background: "var(--color-bg)",
								borderColor: "var(--color-border)",
								color: "var(--color-text)",
							}}
						/>
						<button
							type="submit"
							disabled={
								!input.trim() ||
								isStreaming ||
								loadingSession ||
								startingNewSession
							}
							className={`${compact ? "px-3 py-2 text-xs rounded-lg" : "px-5 py-3 text-sm rounded-xl"} font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
							style={{
								background: "var(--color-accent)",
								color: "white",
							}}
						>
							{isStreaming ? (
								<div
									className={`${compact ? "w-3 h-3" : "w-5 h-5"} border-2 border-white/30 border-t-white rounded-full animate-spin`}
								/>
							) : (
								"Send"
							)}
						</button>
					</form>
				</div>
			</div>
		);
	},
);
