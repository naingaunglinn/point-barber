// Fixture for "Reaching into another module's internals fails the build".
import { SystemService } from '../platform/system/system.service';

export const service: typeof SystemService | undefined = undefined;
