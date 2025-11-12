import type { ChatMessage } from '../../types/chat';
import type { RecommendationOption } from '../../api/recommendations';

type ChatTranscriptProps = {
  messages: ChatMessage[];
  isLoading?: boolean;
  isAssistantThinking?: boolean;
  onAcceptOption?: (optionId: string) => void;
  acceptedOptionId?: string | null;
};

const roleToLabel: Record<ChatMessage['role'], string> = {
  system: 'System',
  user: 'You',
  assistant: 'Agent',
};

const optionDayFormatter = new Intl.DateTimeFormat([], {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const optionTimeFormatter = new Intl.DateTimeFormat([], {
  hour: '2-digit',
  minute: '2-digit',
});

const formatOptionTimeRange = (option: RecommendationOption): string => {
  const startDate = new Date(option.start);
  const endDate = new Date(option.end);
  const dayLabel = optionDayFormatter.format(startDate);
  const timeLabel = `${optionTimeFormatter.format(startDate)} – ${optionTimeFormatter.format(endDate)}`;
  return `${dayLabel} · ${timeLabel}`;
};

const ChatTranscript: React.FC<ChatTranscriptProps> = ({
  messages,
  isLoading = false,
  isAssistantThinking = false,
  onAcceptOption,
  acceptedOptionId,
}) => {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
        Submit a scenario to start the conversation.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-inner shadow-slate-200/50">
      {messages.map(message => {
        const isUser = message.role === 'user';
        const bubbleClasses = isUser
          ? 'self-end rounded-2xl rounded-br-md bg-indigo-600 text-white'
          : 'self-start rounded-2xl rounded-bl-md border border-indigo-100 bg-indigo-50 text-slate-900';
        const options =
          Array.isArray(message.metadata?.options) && message.metadata.options.length > 0
            ? (message.metadata.options as RecommendationOption[])
            : null;

        return (
          <div
            key={message.id}
            className={`max-w-[85%] whitespace-pre-wrap px-4 py-3 text-sm shadow-sm ${bubbleClasses}`}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
              <span>{roleToLabel[message.role]}</span>
              <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p className="leading-relaxed">{message.content}</p>
            {message.status === 'pending' ? (
              <p className="mt-2 text-xs uppercase tracking-[0.2em] opacity-70">Sending…</p>
            ) : null}
            {message.status === 'error' ? (
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-rose-500">Failed</p>
            ) : null}
            {options ? (
              <div className="mt-4 flex flex-col gap-2">
                {options.map(option => {
                  const timeLabel = formatOptionTimeRange(option);
                  const isAccepted = acceptedOptionId === option.id;
                  return (
                    <div
                      key={option.id}
                      className={`flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-left text-sm text-amber-900 shadow-sm ${
                        isAccepted ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="font-semibold">{option.label}</span>
                          <span
                            className={`text-xs font-medium ${
                              isAccepted ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {timeLabel}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onAcceptOption?.(option.id)}
                          disabled={!onAcceptOption || isAccepted || isAssistantThinking}
                          className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition-colors duration-150 ${
                            isAccepted
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-white text-amber-600 hover:bg-amber-100 disabled:opacity-70'
                          }`}
                        >
                          {isAccepted ? 'Accepted' : 'Accept'}
                        </button>
                      </div>
                      {option.reason ? (
                        <p
                          className={`text-xs leading-relaxed ${
                            isAccepted ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {option.reason}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      {isLoading ? (
        <div className="flex items-center gap-2 self-start rounded-full border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-600 shadow-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
           Agent is thinking…
        </div>
      ) : null}
    </div>
  );
};

export default ChatTranscript;

