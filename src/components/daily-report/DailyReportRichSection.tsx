type Props = { name: string; value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean };

export default function DailyReportRichSection({ name, value, onChange, placeholder, disabled = false }: Props) {
  return <textarea id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} rows={5} className="min-h-[120px] w-full resize-y rounded-card border border-studio-border-soft bg-studio-surface px-4 py-3 text-sm leading-7 text-studio-text-primary outline-none placeholder:text-studio-text-muted focus:border-studio-border-active disabled:cursor-not-allowed disabled:opacity-60" />;
}
