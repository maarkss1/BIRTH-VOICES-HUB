import React, { useState, useEffect, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, AlertCircle, Info, CheckCircle, X, ChevronDown, RefreshCw, ChevronRight } from 'lucide-react';
import { useSessionStore } from '../../store/useSessionStore';
import { getAccessibleTextOnBrand, getAccessibleBrandForeground, colors } from './tokens';
import { usePrefersReducedMotion } from './useReducedMotion';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ============================================================================
// 0. ATLAS BRAND MARK
// ============================================================================

export function AtlasLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true">
      <img
        src="/brand/atlasgr-symbol.svg"
        className="h-full w-full object-contain"
        alt=""
      />
    </span>
  );
}

// ============================================================================
// 1. BUTTON COMPONENT
// ============================================================================


export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
}



export function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  style,
  ...props
}: ButtonProps) {
  // `--brand-color` is tenant-controlled (see brandColor.controller.ts / useSessionStore) so
  // `text-white` on the solid `bg-brand` fill can fail WCAG contrast for a light tenant color.
  // getAccessibleTextOnBrand mathematically guarantees >=~4.58:1 regardless of the chosen hue.
  const brandColor = useSessionStore((state) => state.brandColor);
  const accessibleBrandText = getAccessibleTextOnBrand(brandColor);

  const baseStyle = "inline-flex items-center justify-center font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 dark:focus:ring-offset-slate-900";

  const variants = {
    primary: "bg-brand hover:opacity-95 shadow-sm hover:shadow-md",
    secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm dark:bg-red-700 dark:hover:bg-red-800",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80",
    success: "bg-green-600 text-white hover:bg-green-700 shadow-sm dark:bg-green-700 dark:hover:bg-green-800"
  };

  const sizes = {
    xs: "px-2.5 py-1 text-xs",
    sm: "px-3.5 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      style={variant === 'primary' ? { color: accessibleBrandText, ...style } : style}
      {...props}
    >
      {isLoading ? (
        <RefreshCw aria-hidden="true" className="animate-spin h-4 w-4 mr-2" />
      ) : leftIcon ? (
        <span aria-hidden="true" className="mr-2 flex items-center justify-center">{leftIcon}</span>
      ) : null}
      {children}
      {!isLoading && rightIcon && (
        <span aria-hidden="true" className="ml-2 flex items-center justify-center">{rightIcon}</span>
      )}
    </button>
  );
}

// ============================================================================
// 2. INPUT & TEXTAREA COMPONENTS
// ============================================================================


export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  placeholder?: string;
  className?: string;
  value?: string | number | readonly string[];
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}



export function Input({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = !error && helperText ? `${inputId}-helper` : undefined;
  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={errorId ?? helperId}
        className={`w-full px-3.5 py-2.5 border rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all shadow-xs dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:focus:ring-brand ${
          error ? 'border-red-350 focus:ring-red-500 dark:border-red-550' : 'border-slate-300'
        } ${className}`}
        {...props}
      />
      {error && <p id={errorId} className="text-xs text-red-650 dark:text-red-400 font-medium">{error}</p>}
      {!error && helperText && <p id={helperId} className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>}
    </div>
  );
}


export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  className?: string;
}


export function Textarea({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = error ? `${textareaId}-error` : undefined;
  const helperId = !error && helperText ? `${textareaId}-helper` : undefined;
  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        aria-invalid={!!error || undefined}
        aria-describedby={errorId ?? helperId}
        className={`w-full p-3.5 border rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all shadow-xs dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:focus:ring-brand ${
          error ? 'border-red-350 focus:ring-red-500 dark:border-red-550' : 'border-slate-300'
        } ${className}`}
        {...props}
      />
      {error && <p id={errorId} className="text-xs text-red-650 dark:text-red-400 font-medium">{error}</p>}
      {!error && helperText && <p id={helperId} className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>}
    </div>
  );
}

// ============================================================================
// 3. CHECKBOX & SWITCH
// ============================================================================


export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  className?: string;
  checked?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}



export function Checkbox({ label, className = '', ...props }: CheckboxProps) {
  return (
    <label className={`flex items-start gap-2.5 cursor-pointer select-none text-left ${className}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand transition-all dark:border-slate-700 dark:bg-slate-800"
        {...props}
      />
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-tight">{label}</span>
    </label>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export function Switch({ checked, onChange, label, description }: SwitchProps) {
  // A `<div onClick>` (the previous implementation) is mouse/pointer-only: it never receives
  // keyboard focus and Tab/Enter/Space cannot toggle it. Using a real `<button role="switch">`
  // gets Tab focus and Enter/Space activation for free from native button semantics.
  const reactId = useId();
  const labelId = label ? `${reactId}-label` : undefined;
  const descId = description ? `${reactId}-desc` : undefined;
  return (
    <div className="flex items-start justify-between gap-4 text-left">
      {(label || description) && (
        <div className="flex flex-col">
          {label && <span id={labelId} className="text-sm font-bold text-slate-800 dark:text-slate-200">{label}</span>}
          {description && <span id={descId} className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</span>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : 'Alternar'}
        aria-describedby={descId}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
          checked ? 'bg-brand' : 'bg-slate-200 dark:bg-slate-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-100 shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ============================================================================
// 4. SELECT COMPONENT
// ============================================================================


export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  className?: string;
  value?: string | number | readonly string[];
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}



export function Select({ label, error, options, className = '', id, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = error ? `${selectId}-error` : undefined;
  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={!!error || undefined}
          aria-describedby={errorId}
          className={`w-full px-3.5 py-2.5 pr-10 border rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all shadow-xs appearance-none dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 ${
            error ? 'border-red-300 focus:ring-red-500' : 'border-slate-300'
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="absolute right-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
      </div>
      {error && <p id={errorId} className="text-xs text-red-650 dark:text-red-400 font-medium">{error}</p>}
    </div>
  );
}

// ============================================================================
// 5. BADGE COMPONENT
// ============================================================================
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'primary', className = '' }: BadgeProps) {
  // `bg-brand-50`/`dark:bg-brand-900/40` are light/dark *tints* of the tenant's brand color, so
  // `text-brand` at full saturation on top of them can fail contrast for a light tenant color the
  // same way `text-white` on a solid `bg-brand` fill can (see tokens.ts). Compute a same-hue,
  // contrast-safe variant for each surface instead of assuming the raw brand color always works.
  const brandColor = useSessionStore((state) => state.brandColor);
  const brandTextOnLight = getAccessibleBrandForeground(brandColor, colors.light.surface);
  const brandTextOnDark = getAccessibleBrandForeground(brandColor, colors.dark.surface);

  const styles = {
    primary: "bg-brand-50 border-brand-100 dark:bg-brand-900/40 dark:border-brand-800/40",
    secondary: "bg-slate-100 text-slate-750 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    success: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900/40",
    warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40",
    danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/40",
    info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/40"
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${styles[variant]} ${
        variant === 'primary' ? 'text-[var(--badge-fg-light)] dark:text-[var(--badge-fg-dark)]' : ''
      } ${className}`}
      style={variant === 'primary' ? ({ '--badge-fg-light': brandTextOnLight, '--badge-fg-dark': brandTextOnDark } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}

// ============================================================================
// 6. CARD COMPONENT
// ============================================================================

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  key?: React.Key;
}


export function Card({ children, className = '', onClick, hoverable = false }: CardProps) {
  // A clickable `<div>` is invisible to keyboard/screen-reader users: no Tab stop, no Enter/Space
  // activation, and no accessible role. Promote to a real interactive element whenever `onClick`
  // is provided (a plain layout card with no `onClick` stays a non-interactive `<div>`).
  const handleKeyDown = onClick
    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm transition-all duration-200 ${
        onClick ? 'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:focus:ring-offset-slate-900' : ''
      } ${
        onClick || hoverable ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ============================================================================
// 7. SKELETON LOADER
// ============================================================================
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-md ${className}`} />
  );
}

// ============================================================================
// 8. EMPTY STATE COMPONENT
// ============================================================================
interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-250 dark:border-slate-700 rounded-xl max-w-lg mx-auto">
      {icon && (
        <div className="p-4 bg-white dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700 shadow-sm mb-4 text-slate-400 dark:text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed max-w-xs mx-auto">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ============================================================================
// 9. ALERT COMPONENT
// ============================================================================
interface AlertProps {
  title: string;
  description?: string;
  variant?: 'success' | 'warning' | 'danger' | 'info';
}

export function Alert({ title, description, variant = 'info' }: AlertProps) {
  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
    danger: <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
    info: <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
  };

  const styles = {
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-900/30 dark:text-green-300",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300",
    danger: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-300",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-300"
  };

  return (
    <div className={`flex items-start gap-3 p-4 border rounded-xl shadow-xs leading-relaxed ${styles[variant]}`}>
      <div className="shrink-0 mt-0.5">{icons[variant]}</div>
      <div className="flex-1 space-y-1">
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h4>
        {description && <p className="text-xs text-slate-700 dark:text-slate-300">{description}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// 10. SPINNER (LOADING)
// ============================================================================
export function Spinner({ className = '', size = 'md' }: { className?: string, size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4'
  };
  return (
    <div className={`animate-spin rounded-full border-slate-200 border-t-brand dark:border-slate-700 dark:border-t-brand ${sizes[size]} ${className}`} />
  );
}

// ============================================================================
// 11. PROGRESS BAR
// ============================================================================
export function Progress({ value, className = '' }: { value: number, className?: string }) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div className={`w-full bg-slate-100 dark:bg-slate-750 rounded-full h-2.5 overflow-hidden ${className}`}>
      <div 
        className="bg-brand h-2.5 rounded-full transition-all duration-350 ease-out" 
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}

// ============================================================================
// 12. AVATAR COMPONENT
// ============================================================================
export function Avatar({ name, src, size = 'md', className = '' }: { name: string, src?: string, size?: 'sm' | 'md' | 'lg', className?: string }) {
  const brandColor = useSessionStore((state) => state.brandColor);
  const accessibleBrandText = getAccessibleTextOnBrand(brandColor);
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-16 w-16 text-lg'
  };

  const getInitials = (n: string) => {
    return n.trim().split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  };

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-brand font-bold select-none shadow-xs ${sizes[size]} ${className}`}
      style={{ color: accessibleBrandText }}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span>{getInitials(name || 'User')}</span>
      )}
    </div>
  );
}

// ============================================================================
// 13. TABS SYSTEM
// ============================================================================
interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: { tabs: Tab[], activeTab: string, onChange: (id: string) => void, className?: string }) {
  const tablistId = useId();
  const brandColor = useSessionStore((state) => state.brandColor);
  const brandTextOnLight = getAccessibleBrandForeground(brandColor, colors.light.surface);
  const brandTextOnDark = getAccessibleBrandForeground(brandColor, colors.dark.surface);
  const reduceMotion = usePrefersReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    let nextIndex = index;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;
    const nextTab = tabs[nextIndex];
    onChange(nextTab.id);
    document.getElementById(`${tablistId}-tab-${nextTab.id}`)?.focus();
  };

  return (
    <div role="tablist" className={`flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide gap-1 ${className}`}>
      {tabs.map((tab, index) => {
        const isSelected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            id={`${tablistId}-tab-${tab.id}`}
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            style={isSelected ? ({ '--brand-fg-light': brandTextOnLight, '--brand-fg-dark': brandTextOnDark } as React.CSSProperties) : undefined}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-bold transition-all relative whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-t-md ${
              isSelected
                ? 'text-[var(--brand-fg-light)] dark:text-[var(--brand-fg-dark)]'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-250'
            }`}
          >
            {tab.icon && <span aria-hidden="true" className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {isSelected && (
              <motion.div
                layoutId="active-tab-line"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand"
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// 14. BREADCRUMBS
// ============================================================================
interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-450 mb-4 select-none">
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-350 dark:text-slate-600" />}
          {item.onClick ? (
            <button 
              onClick={item.onClick}
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-slate-800 dark:text-slate-200 font-bold">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

// ============================================================================
// 15. TABLE COMPONENT
// ============================================================================
export function Table({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`w-full overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-850 shadow-sm ${className}`}>
      <table className="w-full text-sm text-left border-collapse">
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <thead className={`bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-750 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider ${className}`}>
      {children}
    </thead>
  );
}

interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TableRow({ children, className = '', onClick }: TableRowProps) {
  return (
    <tr 
      onClick={onClick} 
      className={`border-b last:border-0 border-slate-150 dark:border-slate-750 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className = '', isHeader = false }: { children: React.ReactNode, className?: string, isHeader?: boolean }) {
  if (isHeader) {
    return <th className={`px-6 py-4 font-bold text-slate-600 dark:text-slate-400 ${className}`}>{children}</th>;
  }
  return <td className={`px-6 py-4 text-slate-750 dark:text-slate-300 font-medium ${className}`}>{children}</td>;
}

// ============================================================================
// 16. MODAL & DIALOG
// ============================================================================
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  // Escape-to-close plus a manual focus trap: without this, Tab can walk focus out of the dialog
  // and into the (visually hidden, but still interactive) page behind the backdrop.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    if (isOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Move focus into the dialog on open, and restore it to whatever triggered the dialog on close
  // (otherwise focus silently resets to <body>, disorienting keyboard/screen-reader users).
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const raf = requestAnimationFrame(() => {
        const focusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (focusable ?? dialogRef.current)?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
    return undefined;
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
          />

          {/* Container */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 15 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 15 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.3 }}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full overflow-hidden flex flex-col z-10 outline-none"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 id={titleId} className="font-bold text-slate-900 dark:text-white text-base leading-none">{title}</h3>
              <button onClick={onClose} aria-label="Fechar" className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X aria-hidden="true" className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh] text-left">
              {children}
            </div>

            {footer && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-900/45 border-t border-slate-200 dark:border-slate-700">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// 17. TIMELINE COMPONENT
// ============================================================================
interface TimelineItem {
  title: string;
  description: string;
  time: string;
  icon?: React.ReactNode;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="space-y-6 text-left relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-700">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-4 relative">
          <div className="h-7 w-7 rounded-full bg-white dark:bg-slate-800 border-2 border-brand text-brand flex items-center justify-center shrink-0 z-10 shadow-xs">
            {item.icon || <Info className="h-3.5 w-3.5" />}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-150">{item.title}</h4>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">{item.time}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// 18. TOOLTIP
// ============================================================================
export function Tooltip({ text, children }: { text: string, children: React.ReactNode }) {
  // `group-hover` alone is invisible to keyboard users: nothing here ever receives focus, so the
  // tooltip can never appear without a mouse. Making the wrapper itself a (0) tab stop with
  // `group-focus-within` and `aria-describedby` surfaces the same text on Tab, and to a screen
  // reader, as it does on hover.
  const tooltipId = useId();
  return (
    <div tabIndex={0} aria-describedby={tooltipId} className="relative group inline-block outline-none rounded-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
      {children}
      <div
        id={tooltipId}
        role="tooltip"
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-950 text-white text-[10px] font-semibold rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity whitespace-nowrap z-50"
      >
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-950" />
      </div>
    </div>
  );
}

// ============================================================================
// 19. TOAST MANAGER & CUSTOM CONTEXT
// ============================================================================
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  return { toasts, showToast };
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    // `aria-live="polite"` + `role="status"` announce new toasts to screen readers; without it a
    // toast is a purely visual event that a non-sighted user would never learn happened.
    <div aria-live="polite" role="status" className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : undefined}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            className={`p-4 rounded-xl border shadow-lg flex items-start gap-3 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 pointer-events-auto ${
              toast.type === 'success' ? 'border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-950/20' :
              toast.type === 'error' ? 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20' :
              'border-slate-200 bg-white dark:border-slate-700'
            }`}
          >
            {toast.type === 'success' && <CheckCircle aria-hidden="true" className="h-5 w-5 text-green-600 dark:text-green-450 shrink-0 mt-0.5" />}
            {toast.type === 'error' && <AlertCircle aria-hidden="true" className="h-5 w-5 text-red-600 dark:text-red-450 shrink-0 mt-0.5" />}
            {toast.type === 'info' && <Info aria-hidden="true" className="h-5 w-5 text-blue-600 dark:text-blue-450 shrink-0 mt-0.5" />}
            <span className="text-xs font-semibold leading-relaxed flex-1">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
