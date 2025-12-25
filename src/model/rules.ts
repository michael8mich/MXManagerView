import type { AllowedMove, OwnerType } from './types';

export function isMoveAllowed(
  allowedMoves: AllowedMove[],
  fromType: OwnerType,
  toType: OwnerType,
) {
  return allowedMoves.some((m) => m.fromType === fromType && m.toType === toType);
}
