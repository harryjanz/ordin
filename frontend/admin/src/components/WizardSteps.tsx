import styles from "./WizardSteps.module.scss";

export interface StepDef {
  label: string;
  sub: string;
}

export default function WizardSteps({
  steps,
  current,
  maxReached,
  onSelect,
}: {
  steps: StepDef[];
  current: number;
  maxReached: number;
  onSelect: (i: number) => void;
}) {
  return (
    <nav className={styles.steps}>
      {steps.map((step, i) => {
        const isCurrent = i === current;
        const isDone = i < current || (i <= maxReached && i < current);
        const clickable = i <= maxReached;
        return (
          <div key={step.label}>
            {i > 0 && <div className={styles.connector} />}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(i)}
              className={`${styles.navBtn} ${isCurrent ? styles.navBtnCurrent : ""}`}
            >
              <span className={`${styles.num} ${isCurrent ? styles.numCurrent : isDone ? styles.numDone : ""}`}>
                {isDone ? "✓" : i + 1}
              </span>
              <span>
                <div className={`${styles.label} ${isCurrent ? styles.labelCurrent : ""}`}>{step.label}</div>
                <div className={styles.sub}>{step.sub}</div>
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
