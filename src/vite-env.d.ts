/// <reference types="vite/client" />

interface JsonWebKey {
  kid?: string;
}

declare namespace React {
  export type ReactNode = any;
  export type ReactElement<P = any, T = any> = any;
  export type ElementType<P = any> = any;
  export type ComponentType<P = {}> = any;
  export type FC<P = {}> = (props: P & { children?: any; key?: any }) => any;
  export type CSSProperties = Record<string, any>;
  export type SVGProps<T = SVGSVGElement> = Record<string, any>;
  export type FormEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type ChangeEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type MouseEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any; clientX: number; clientY: number; button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
  export type PointerEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any; clientX: number; clientY: number; pointerId: number; button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
  export type KeyboardEvent<T = Element> = { key: string; code?: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type DragEvent<T = Element> = { dataTransfer: DataTransfer; preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type FocusEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type HTMLAttributes<T = Element> = Record<string, any>;
  export type ButtonHTMLAttributes<T = HTMLButtonElement> = Record<string, any>;
  export type InputHTMLAttributes<T = HTMLInputElement> = Record<string, any>;
  export type TextareaHTMLAttributes<T = HTMLTextAreaElement> = Record<string, any>;
  export type SelectHTMLAttributes<T = HTMLSelectElement> = Record<string, any>;
  export type ErrorInfo = { componentStack?: string | null };
  export type RefObject<T> = { current: T | null };
  export type MutableRefObject<T> = { current: T };
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);
}

declare module 'react' {
  export type ReactNode = any;
  export type ReactElement<P = any, T = any> = any;
  export type ElementType<P = any> = any;
  export type ComponentType<P = {}> = any;
  export type FC<P = {}> = (props: P & { children?: any; key?: any }) => any;
  export type CSSProperties = Record<string, any>;
  export type SVGProps<T = SVGSVGElement> = Record<string, any>;
  export type FormEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type ChangeEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type MouseEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any; clientX: number; clientY: number; button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
  export type PointerEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any; clientX: number; clientY: number; pointerId: number; button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };
  export type KeyboardEvent<T = Element> = { key: string; code?: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type DragEvent<T = Element> = { dataTransfer: DataTransfer; preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type FocusEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; currentTarget: T; target: T & any };
  export type HTMLAttributes<T = Element> = Record<string, any>;
  export type ButtonHTMLAttributes<T = HTMLButtonElement> = Record<string, any>;
  export type InputHTMLAttributes<T = HTMLInputElement> = Record<string, any>;
  export type TextareaHTMLAttributes<T = HTMLTextAreaElement> = Record<string, any>;
  export type SelectHTMLAttributes<T = HTMLSelectElement> = Record<string, any>;
  export type ErrorInfo = { componentStack?: string | null };
  export type RefObject<T> = { current: T | null };
  export type MutableRefObject<T> = { current: T };
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);

  export class Component<P = {}, S = {}> {
    props: Readonly<P> & { children?: any };
    state: S;
    constructor(props: P);
    setState<K extends keyof S>(state: ((prevState: Readonly<S>, props: Readonly<P>) => Pick<S, K> | S | null) | (Pick<S, K> | S | null), callback?: () => void): void;
    render(): any;
  }

  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly any[] | undefined): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useRef<T>(initialValue: T | null): RefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useContext<T>(context: Context<T>): T;
  export function useId(): string;
  export function useSyncExternalStore<Snapshot>(subscribe: (onStoreChange: () => void) => () => void, getSnapshot: () => Snapshot, getServerSnapshot?: () => Snapshot): Snapshot;
  export function createContext<T>(defaultValue: T): Context<T>;
  export function memo<T>(component: T): T;
  export function lazy<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): T;
  export function forwardRef<T, P = {}>(render: (props: P, ref: any) => any): any;
  export function createElement(type: any, props?: any, ...children: any[]): any;
  export const Fragment: any;
  export const StrictMode: any;
  export const Suspense: any;

  export interface Context<T> {
    Provider: any;
    Consumer: any;
  }

  const ReactDefault: {
    useState: typeof useState;
    useEffect: typeof useEffect;
    useLayoutEffect: typeof useLayoutEffect;
    useMemo: typeof useMemo;
    useCallback: typeof useCallback;
    useRef: typeof useRef;
    useContext: typeof useContext;
    useId: typeof useId;
    useSyncExternalStore: typeof useSyncExternalStore;
    createContext: typeof createContext;
    Component: typeof Component;
    Fragment: any;
    StrictMode: any;
    Suspense: any;
    memo: typeof memo;
    lazy: typeof lazy;
    forwardRef: typeof forwardRef;
    createElement: typeof createElement;
    [key: string]: any;
  };
  export default ReactDefault;
}

declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export namespace JSX {
    interface Element {}
    interface IntrinsicAttributes {
      key?: any;
      children?: any;
    }
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

declare module 'react/jsx-dev-runtime' {
  export const Fragment: any;
  export function jsxDEV(type: any, props: any, key?: any, isStaticChildren?: boolean, source?: any, self?: any): any;
}
