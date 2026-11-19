import { DAY_LETTERS } from '../../../shared/schedule';

/** The days of the week from Monday, as round chips that toggle (0 Sunday … 6 Saturday). */
export function DayPicker({ days, label, onChange }: { days: number[]; label: string; onChange: (days: number[]) => void }) {
  return (
    <div class="day-picker" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <button
          key={d}
          type="button"
          class={`day-chip ${days.includes(d) ? 'on' : ''}`}
          aria-pressed={days.includes(d)}
          onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
        >
          {DAY_LETTERS[d]}
        </button>
      ))}
    </div>
  );
}
