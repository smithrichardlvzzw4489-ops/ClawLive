import { redirect } from 'next/navigation';

/** 兼容旧链接：「提议中」已并入「进化中」列表 */
export default function EvolutionNetworkProposedRedirectPage() {
  redirect('/evolution-network/active');
}
