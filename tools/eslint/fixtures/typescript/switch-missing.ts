declare function assertNever(value: never): never;

export function labelOf(status: 'started' | 'completed' | 'finished' | 'incomplete'): string {
  switch (status) {
    case 'started':
      return 'Started';
    case 'completed':
      return 'Completed';
    case 'finished':
      return 'Finished';
    default:
      return assertNever(status);
  }
}
