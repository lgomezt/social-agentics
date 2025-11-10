import { type FormEvent } from 'react';

type ScenarioFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
};

const ScenarioForm: React.FC<ScenarioFormProps> = ({
  value,
  onChange,
  onSubmit,
  isSubmitting = false,
}) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/60 backdrop-blur"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-900">Scenario</h2>
        <p className="text-sm text-slate-500">
          Describe who is requesting the meeting and why. Our agent will recommend two 60-minute
          options within the next 7 days.
        </p>
      </div>
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Scenario details
        </span>
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="e.g. Alice needs time with the design team to plan the Q4 campaign."
          className="min-h-[60px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-inner shadow-slate-200/50 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </label>
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300"
        disabled={isSubmitting || value.trim().length === 0}
      >
        {isSubmitting ? 'Submitting…' : 'Submit scenario'}
      </button>
    </form>
  );
};

export default ScenarioForm;

