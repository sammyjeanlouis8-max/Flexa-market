/**
 * Supported methods shown on the Recharge / Cash Out selection cards.
 * MonCash is included only when the account's registered country is Haiti
 * (`user.country === "Haiti"`), never via GPS or IP.
 */
export function walletChoiceMethodLines(isHaitiAccount: boolean, labels: {
  monCash: string;
  card: string;
  agent: string;
  crypto: string;
  transfer: string;
}): { recharge: string; withdraw: string } {
  const recharge = [
    ...(isHaitiAccount ? [labels.monCash] : []),
    labels.card,
    labels.agent,
    labels.crypto,
  ].join(" · ");
  const withdraw = [
    ...(isHaitiAccount ? [labels.monCash] : []),
    labels.agent,
    labels.transfer,
  ].join(" · ");
  return { recharge, withdraw };
}
