type ChatMessageInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
};

const ChatMessageInput: React.FC<ChatMessageInputProps> = ({
  value,
  onChange,
  onSend,
  placeholder = 'Type a follow-up message…',
  disabled = false,
}) => (
  <div className="flex shrink-0 items-end gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm shadow-slate-200/50">
    <textarea
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-20 flex-1 resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
      disabled={disabled}
    />
    <button
      type="button"
      onClick={onSend}
      className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
      disabled={disabled || value.trim().length === 0}
    >
      Send
    </button>
  </div>
);

export default ChatMessageInput;

