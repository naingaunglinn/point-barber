'use client';

import { cn } from 'cn';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, type KeyboardEvent } from 'react';

import { Input } from '../../primitives/input';
import { Button } from '../Button/Button';

// A search box with its magnifier button (AD-LIST-01 · AD-NAV-05 · owner review 12/Oct/2026): the
// placeholder says what it searches and names the field; the text is reported as it is typed, and the
// magnifier — or Enter, the keyboard's "search" key on a phone — reports the search and closes the
// phone's keyboard so the results are visible. A `role="search"` landmark, not a form, so it can sit
// inside one.

export interface SearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The magnifier or Enter: search now. */
  readonly onSearch?: (value: string) => void;
  /** Translated: what it searches ("Receipt no."). */
  readonly placeholder: string;
  readonly autoFocus?: boolean;
  readonly className?: string;
}

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder,
  autoFocus,
  className,
}: SearchInputProps) {
  const t = useTranslations('common.action');
  const input = useRef<HTMLInputElement>(null);
  const search = () => {
    input.current?.blur(); // the phone keyboard closes, the results show
    onSearch?.(value);
  };
  return (
    <div role="search" className={cn('flex items-stretch', className)} data-slot="search-input">
      <Input
        ref={input}
        type="search"
        enterKeyHint="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          search();
        }}
        className="h-12 min-w-0 flex-1 rounded-e-none text-base md:h-10"
      />
      <Button
        variant="secondary"
        iconOnly
        icon={<Search />}
        aria-label={t('search')}
        onClick={search}
        className="rounded-s-none border-s-0"
      />
    </div>
  );
}
