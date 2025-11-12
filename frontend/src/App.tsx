import { useCallback, useMemo, useState } from 'react';
import Calendar, {
  type CalendarEvent,
  type CalendarProps,
} from './components/calendar/calendar';
import ScenarioForm from './components/scenario/scenario-form';
import ChatTranscript from './components/chat/chat-transcript';
import ChatMessageInput from './components/chat/chat-message-input';
import {
  submitScenario,
  recommendationsToCalendarEvents,
  type RecommendationOption,
} from './api/recommendations';
import {
  createChatMessage,
  type ChatMessage,
} from './types/chat';

function App() {
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [scenarioDraft, setScenarioDraft] = useState('');
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isScenarioSubmitting, setIsScenarioSubmitting] = useState(false);
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [currentOptions, setCurrentOptions] = useState<RecommendationOption[]>([]);
  const [optionsHistory, setOptionsHistory] = useState<RecommendationOption[]>([]);
  const [acceptedOptionId, setAcceptedOptionId] = useState<string | null>(null);

  const calendarProps: CalendarProps = useMemo(
    () => ({
      calendarEvents,
      setCalendarEvents,
    }),
    [calendarEvents, setCalendarEvents],
  );

  const requestRecommendations = useCallback(
    async (conversation: ChatMessage[], scenarioText: string) => {
      setIsAssistantThinking(true);
      setCalendarEvents(prev =>
        prev.filter(
          event =>
            !(
              event.source === 'backend' &&
              (event.metadata?.status === 'suggested' ||
                event.metadata?.status === 'accepted')
            ),
        ),
      );

      try {
        const timezone =
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : 'UTC';

        const response = await submitScenario({
          scenario: scenarioText,
          conversation: conversation.map(message => ({
            role: message.role,
            content: message.content,
          })),
          timezone,
          previousOptions: optionsHistory,
        });

        const assistantMessage = createChatMessage({
          role: 'assistant',
          content: response.message,
          metadata: {
            options: response.options,
          },
        });

        setChatMessages(prev => [...prev, assistantMessage]);
        setCurrentOptions(response.options ?? []);
        setOptionsHistory(prev => [...prev, ...(response.options ?? [])]);
        setAcceptedOptionId(null);
        setCalendarEvents(prev => {
          const preserved = prev.filter(
            event =>
              !(
                event.source === 'backend' &&
                (event.metadata?.status === 'suggested' ||
                  event.metadata?.status === 'accepted')
              ),
          );
          const recommendedEvents = recommendationsToCalendarEvents(response.options ?? []);
          return [...preserved, ...recommendedEvents];
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Something went wrong while requesting recommendations.';
        setChatMessages(prev => [
          ...prev,
          createChatMessage({
            role: 'system',
            content: message,
            status: 'error',
          }),
        ]);
      } finally {
        setIsAssistantThinking(false);
      }
    },
    [optionsHistory, setCalendarEvents],
  );

  const handleScenarioSubmit = useCallback(async () => {
    const trimmed = scenarioDraft.trim();
    if (trimmed.length === 0) {
      return;
    }

    const scenarioMessage = createChatMessage({
      role: 'user',
      content: trimmed,
    });
    setChatMessages(prev => [...prev, scenarioMessage]);
    setScenarioDraft('');
    setActiveScenario(trimmed);
    setIsScenarioSubmitting(true);
    try {
      await requestRecommendations([...chatMessages, scenarioMessage], trimmed);
    } finally {
      setIsScenarioSubmitting(false);
    }
  }, [scenarioDraft, chatMessages, requestRecommendations]);

  const handleChatSend = useCallback(async () => {
    if (!activeScenario) return;

    const trimmed = chatInput.trim();
    if (trimmed.length === 0) {
      return;
    }

    const followUp = createChatMessage({
      role: 'user',
      content: trimmed,
    });

    const pendingMessages = [...chatMessages, followUp];
    setChatMessages(pendingMessages);
    setChatInput('');
    await requestRecommendations(pendingMessages, activeScenario);
  }, [chatInput, chatMessages, activeScenario, requestRecommendations]);

  const handleScenarioReset = useCallback(() => {
    setActiveScenario(null);
    setScenarioDraft('');
    setChatMessages([]);
    setChatInput('');
    setCalendarEvents(prev => prev.filter(event => event.source !== 'backend'));
    setCurrentOptions([]);
    setOptionsHistory([]);
    setAcceptedOptionId(null);
    setIsAssistantThinking(false);
  }, [setCalendarEvents]);

  const handleAcceptOption = useCallback(
    (optionId: string) => {
      const option = currentOptions.find(item => item.id === optionId);
      if (!option) return;

      setAcceptedOptionId(optionId);
      setCalendarEvents(prev =>
        prev.map(event => {
          if (event.source !== 'backend') return event;
          if (event.externalId === optionId) {
            return {
              ...event,
              metadata: {
                ...event.metadata,
                status: 'accepted',
              },
            };
          }

          if (event.metadata?.status === 'accepted') {
            return {
              ...event,
              metadata: {
                ...event.metadata,
                status: 'suggested',
              },
            };
          }
          return event;
        }),
      );

      const userMessage = createChatMessage({
        role: 'user',
        content: `I prefer ${option.label}.`,
        metadata: { selectedOptionId: optionId },
      });

      const assistantFollowUp = createChatMessage({
        role: 'assistant',
        content: `Thanks! Could you share why ${option.label} works better than the other options?`,
        metadata: { followUp: 'request-rationale', optionId },
      });

      setChatMessages(prev => [...prev, userMessage, assistantFollowUp]);
    },
    [currentOptions, setCalendarEvents],
  );

  const hasScenario = Boolean(activeScenario);
  const transitionClasses = 'transition-all duration-500 ease-out';
  const sidebarGapClass = hasScenario ? 'gap-0' : 'gap-6';

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-100">
      <div className="mx-auto flex h-full flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside
          className={`flex w-full max-h-full flex-col ${sidebarGapClass} overflow-hidden lg:w-[420px] lg:shrink-0`}
        >
          <div
            className={`${transitionClasses} ${hasScenario ? 'pointer-events-none opacity-0 -translate-y-4 max-h-0 overflow-hidden' : 'opacity-100 translate-y-0 max-h-[800px]'}`}
          >
            <header className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">
                Social Agentics
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                Test social understanding
              </h1>
              <p className="mt-3 text-sm text-slate-500">
                First, block your busy slots in the calendar. Then share the scenario to receive two
                recommended times inside the next 7 days.
              </p>
            </header>
            <ScenarioForm
              value={scenarioDraft}
              onChange={setScenarioDraft}
              onSubmit={handleScenarioSubmit}
              isSubmitting={isScenarioSubmitting}
            />
          </div>

          <section
            className={`${transitionClasses} flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-2xl ${hasScenario ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}
          >
            {activeScenario ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-600/90 p-5 text-white shadow-sm shadow-indigo-500/40">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-100">
                    Scenario
                  </h2>
                  <button
                    type="button"
                    onClick={handleScenarioReset}
                    className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white transition-colors duration-150 hover:bg-white/20"
                  >
                    Change
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-indigo-50">{activeScenario}</p>
              </div>
            ) : null}

            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                Chat
              </h2>
              <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-indigo-500">
                Live
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
              <ChatTranscript
                messages={chatMessages}
                isLoading={isAssistantThinking}
                onAcceptOption={handleAcceptOption}
                acceptedOptionId={acceptedOptionId}
                isAssistantThinking={isAssistantThinking}
              />
              <ChatMessageInput
                value={chatInput}
                onChange={setChatInput}
                onSend={handleChatSend}
                placeholder="Send more context or accept a suggestion…"
                disabled={!hasScenario || isAssistantThinking}
              />
            </div>
          </section>
        </aside>
        <main className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80">
          <Calendar {...calendarProps} />
        </main>
      </div>
    </div>
  );
}

export default App;
