import { useLocation } from "@tanstack/react-router";
import { useCallback, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children?: ReactNode;
  end?: boolean;
};

export function Link({ to, children, end: _end, ...props }: LinkProps) {
  return (
    <a href={to} {...props}>
      {children}
    </a>
  );
}

export function NavLink({ to, children, className, end = false, ...props }: LinkProps) {
  const location = useLocation();
  const active = end
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(`${to}/`);
  const resolvedClassName =
    typeof className === "function"
      ? (className as (state: { isActive: boolean; isPending: boolean; isTransitioning: boolean }) => string)({
          isActive: active,
          isPending: false,
          isTransitioning: false,
        })
      : className;

  return (
    <a
      href={to}
      aria-current={active ? "page" : undefined}
      className={resolvedClassName}
      {...props}
    >
      {children}
    </a>
  );
}

export function useNavigate() {
  return useCallback((to: string | number) => {
    if (typeof window === "undefined") return;
    if (typeof to === "number") {
      window.history.go(to);
      return;
    }
    window.location.assign(to);
  }, []);
}

export function useParams<T extends Record<string, string | undefined>>() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);
  const params: Record<string, string | undefined> = {};

  if (segments[0] === "implantacao-contabil") params.implementationId = segments[1];
  if (segments[0] === "gestao-fechamentos" && segments[1] === "central")
    params.batchId = segments[2];

  return params as T;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const location = useLocation();
  const [version, setVersion] = useState(0);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search, version]);

  const setParams = useCallback((next: URLSearchParams) => {
    if (typeof window === "undefined") return;
    const query = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    setVersion((value) => value + 1);
  }, []);

  return [params, setParams];
}
