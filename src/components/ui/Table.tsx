"use client";

import { type ReactNode, type TableHTMLAttributes } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  width?: string;
}

export interface TableProps<T> extends TableHTMLAttributes<HTMLTableElement> {
  columns: Column<T>[];
  data: T[];
  keyAccessor: (row: T) => string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  striped?: boolean;
  hoverable?: boolean;
  loading?: boolean;
  loadingRows?: number;
}

export function Table<T>({
  columns,
  data,
  keyAccessor,
  emptyMessage = "No data available",
  emptyAction,
  striped = true,
  hoverable = true,
  loading = false,
  loadingRows = 5,
  className = "",
  ...props
}: TableProps<T>) {
  if (loading) {
    return (
      <div className={`table-container ${className}`}>
        <table className="table" aria-busy="true" {...props}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.headerClassName} style={{ width: column.width }}>
                  <div className="skeleton h-4 w-3/4" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: loadingRows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    <div className="skeleton h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-secondary">{emptyMessage}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className={`table-container ${className}`}>
        <table className="table" {...props}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.headerClassName} style={{ width: column.width }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={keyAccessor(row)} className={`${striped && rowIndex % 2 === 1 ? "bg-surface-hover" : ""} ${hoverable ? "hover:bg-surface-hover" : ""}`}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render ? column.render(row, rowIndex) : (row as Record<string, unknown>)[column.key] as ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  showPageSizes?: boolean;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className = "",
  showPageSizes = false,
  pageSizeOptions = [10, 20, 50, 100],
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = total === 0 ? 0 : Math.min(page * pageSize, total);

  if (totalPages <= 1 && !showPageSizes) return null;

  return (
    <nav
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border ${className}`}
      aria-label="Pagination"
    >
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <span>
          Showing <strong>{firstResult}</strong> to <strong>{lastResult}</strong> of <strong>{total}</strong> results
        </span>
        {showPageSizes && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="input py-1.5 px-2 w-auto"
            aria-label="Results per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn btn-secondary btn-sm"
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className="text-sm text-text-secondary">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn btn-secondary btn-sm"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
