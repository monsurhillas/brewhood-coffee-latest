// Shared success/error feedback line for the entry forms (Sale, Collection,
// Manager Cost). Previously every form rendered both outcomes in the same
// brand color, so a failure like "Pick an employee first." looked identical
// to a success like "Sale recorded." — this makes the two unmistakable.

export type FormFeedback = { type: "success" | "error"; text: string } | null;

function iconProps() {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function CheckIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5.2" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function FormMessage({ message }: { message: FormFeedback }) {
  if (!message) return null;
  const isError = message.type === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`flex items-center gap-1.5 text-sm ${
        isError ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
      }`}
    >
      <span className="shrink-0">{isError ? <WarnIcon /> : <CheckIcon />}</span>
      {message.text}
    </p>
  );
}
