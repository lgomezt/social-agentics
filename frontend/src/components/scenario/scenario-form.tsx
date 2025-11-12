import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import PREDEFINED_SCENARIOS from './predefined-scenarios';

const CUSTOM_SCENARIO_INDEX = PREDEFINED_SCENARIOS.length;

const resolveScenarioIndex = (input: string): number => {
  if (input.trim().length === 0) {
    return CUSTOM_SCENARIO_INDEX;
  }

  const matchedIndex = PREDEFINED_SCENARIOS.findIndex(scenario => scenario === input);
  return matchedIndex === -1 ? CUSTOM_SCENARIO_INDEX : matchedIndex;
};

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
  const [customScenarioDraft, setCustomScenarioDraft] = useState(() => {
    const initialIndex = resolveScenarioIndex(value);
    return initialIndex === CUSTOM_SCENARIO_INDEX ? value : '';
  });

  const currentScenarioIndex = resolveScenarioIndex(value);
  const totalScenarioOptions = CUSTOM_SCENARIO_INDEX + 1;

  useEffect(() => {
    if (resolveScenarioIndex(value) === CUSTOM_SCENARIO_INDEX) {
      setCustomScenarioDraft(value);
    }
  }, [value]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleScenarioCycle = (direction: 1 | -1) => {
    const nextIndex =
      (currentScenarioIndex + direction + totalScenarioOptions) % totalScenarioOptions;

    if (nextIndex === CUSTOM_SCENARIO_INDEX) {
      onChange(customScenarioDraft);
      return;
    }

    const preset = PREDEFINED_SCENARIOS[nextIndex];
    if (preset !== value) {
      onChange(preset);
    }
  };

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    if (resolveScenarioIndex(nextValue) === CUSTOM_SCENARIO_INDEX) {
      setCustomScenarioDraft(nextValue);
    }
    onChange(nextValue);
  };

  const scenarioLabel =
    currentScenarioIndex === CUSTOM_SCENARIO_INDEX
      ? `1 of ${PREDEFINED_SCENARIOS.length + 1}`
      : `${currentScenarioIndex + 2} of ${PREDEFINED_SCENARIOS.length + 1}`;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/60 backdrop-blur"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Pick an scenario</h2>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-2 py-1">
            <button
              type="button"
              onClick={() => handleScenarioCycle(-1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors duration-150 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
              aria-label="Previous scenario"
            >
              ←
            </button>
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {scenarioLabel}
            </span>
            <button
              type="button"
              onClick={() => handleScenarioCycle(1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors duration-150 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
              aria-label="Next scenario"
            >
              →
            </button>
          </div>
        </div>
        {/* <p className="text-sm text-slate-500">
          Describe who is requesting the meeting and why. Our agent will recommend two 60-minute
          options within the next 7 days.
        </p> */}
      </div>
      <label className="flex flex-1 flex-col gap-1">
        <textarea
          value={value}
          onChange={handleTextareaChange}
          placeholder="e.g. Alice needs time with the design team to plan the Q4 campaign."
          className="min-h-[140px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-inner shadow-slate-200/50 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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

