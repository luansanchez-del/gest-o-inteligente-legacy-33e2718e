interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "📄", title, description, action }: EmptyStateProps) {
  return (
    <div className="wf-state">
      <div className="wf-state-icon">{icon}</div>
      <div className="wf-state-title">{title}</div>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="wf-state wf-state-error">
      <div className="wf-state-icon">⚠️</div>
      <div className="wf-state-title">Não foi possível carregar os dados</div>
      <p>{message}</p>
      {onRetry && (
        <button className="wf-btn" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="wf-skeleton-row" />
      ))}
    </div>
  );
}
