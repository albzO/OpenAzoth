/** Small reusable form controls. */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n';

type Option<T> = readonly [T, string];

export function Seg<T extends string | number | boolean>(props: {
  options: readonly Option<T>[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  class?: string;
  titles?: Partial<Record<string, string>>;
}) {
  return (
    <div class={`seg ${props.class ?? ''}`}>
      {props.options.map(([v, label]) => (
        <button key={String(v)} class={v === props.value ? 'sel' : ''} title={props.titles?.[String(v)]} onClick={() => props.onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Button for destructive actions: the first click arms it, a second click within 4 s runs it. */
export function ConfirmButton(props: { onConfirm: () => void; disabled?: boolean; title?: string; children: ComponentChildren }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      class={`danger ${armed ? 'armed' : ''}`}
      disabled={props.disabled}
      title={props.title}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        props.onConfirm();
      }}
    >
      {armed ? t('confirm.again') : props.children}
    </button>
  );
}

export function Row(props: { label?: string; children: ComponentChildren; style?: string }) {
  return (
    <div class="row" style={props.style}>
      {props.label !== undefined && <span class="label">{props.label}</span>}
      {props.children}
    </div>
  );
}

export function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  /** fired while dragging */
  onInput?: (v: number) => void;
  /** fired on release */
  onChange?: (v: number) => void;
}) {
  return (
    <Row label={props.label}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onInput?.(+(e.currentTarget as HTMLInputElement).value)}
        onChange={(e) => props.onChange?.(+(e.currentTarget as HTMLInputElement).value)}
      />
      <span class="val">{props.format(props.value)}</span>
    </Row>
  );
}

export function ColorInput(props: { value: string; onInput: (v: string) => void; title?: string }) {
  return <input type="color" value={props.value} title={props.title} onInput={(e) => props.onInput((e.currentTarget as HTMLInputElement).value)} />;
}

export function Card(props: { title?: ComponentChildren; sub?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; class?: string }) {
  return (
    <div class={`card ${props.class ?? ''}`}>
      {props.title !== undefined && (
        <h3>
          {props.title} {props.sub && <small>{props.sub}</small>}
          {props.actions && (
            <>
              <span class="spacer" />
              {props.actions}
            </>
          )}
        </h3>
      )}
      {props.children}
    </div>
  );
}
