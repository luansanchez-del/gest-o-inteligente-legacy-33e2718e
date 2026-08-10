export type StepState = "done" | "current" | "pending" | "attention";

export interface StepDefinition {
  key: string;
  label: string;
  state: StepState;
}

interface Props {
  steps: StepDefinition[];
  activeKey: string;
  onSelect: (key: string) => void;
}

const ICONS: Record<StepState, string> = {
  done: "✓",
  current: "",
  pending: "",
  attention: "!",
};

export function Stepper({ steps, activeKey, onSelect }: Props) {
  return (
    <nav className="wf-stepper" aria-label="Etapas da implantação">
      {steps.map((step, index) => (
        <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
          <button
            type="button"
            className={`wf-step${step.key === activeKey ? " is-current" : ""}${step.state === "done" ? " is-done" : ""}${step.state === "attention" ? " is-attention" : ""}`}
            onClick={() => onSelect(step.key)}
          >
            <span className="wf-step-index">{ICONS[step.state] || index + 1}</span>
            {step.label}
          </button>
          {index < steps.length - 1 && <span className="wf-step-connector" />}
        </div>
      ))}
    </nav>
  );
}
