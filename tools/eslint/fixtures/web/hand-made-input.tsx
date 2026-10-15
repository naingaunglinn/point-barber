// Must fail twice under apps/web and pass under packages/ui (spec "A hand-made input in a screen").
import { Root } from '@radix-ui/react-dialog';

export const Field = () => <input type="text" />;
export const Overlay = Root;
