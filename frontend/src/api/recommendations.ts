import type { CalendarEvent } from '../components/calendar/calendar.types';
import { isoRangeToCalendarEvent } from './calendar';
import type { ChatMessage } from '../types/chat';

const API_BASE = '/api/recommendations';

export type RecommendationOption = {
  id: string;
  label: string;
  start: string;
  end: string;
  reason: string;
};

export type RecommendationResponse = {
  scenario: string;
  message: string;
  options: RecommendationOption[];
  model: string;
  createdAt: string;
};

export type ScenarioRequestPayload = {
  scenario: string;
  conversation?: Array<Pick<ChatMessage, 'role' | 'content'>>;
  timezone?: string;
  previousOptions?: RecommendationOption[];
};

const assertResponse = async (response: Response) => {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.detail ?? response.statusText;
    throw new Error(`Recommendation request failed: ${response.status} ${message}`);
  }
};

export const submitScenario = async (
  payload: ScenarioRequestPayload,
): Promise<RecommendationResponse> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  console.log('response', response);
  await assertResponse(response);
  return response.json();
};

export const recommendationsToCalendarEvents = (
  options: RecommendationOption[],
): CalendarEvent[] => {
  return options.map(option =>
    isoRangeToCalendarEvent({
      id: option.id,
      start: option.start,
      end: option.end,
      title: option.label,
      source: 'backend',
      externalId: option.id,
      metadata: {
        label: option.label,
        reason: option.reason,
        status: 'suggested',
      },
    }),
  );
};

