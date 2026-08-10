import { formatNumber } from "../../../lib/format";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="wf-pagination">
      <span>
        {formatNumber(start)}–{formatNumber(end)} de {formatNumber(total)}
      </span>
      <div className="wf-pagination-controls">
        <button
          className="wf-btn wf-btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Anterior
        </button>
        <span>
          Página {page} de {totalPages}
        </span>
        <button
          className="wf-btn wf-btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}
