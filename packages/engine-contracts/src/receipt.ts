import { canonicalHash } from './canonical.js';
import { ok, err, type Result } from './diagnostics.js';
import type { EngineVersions, EpochRef } from './version.js';
import type { NormalizedRequest } from './request.js';
import type { CostReport } from './cost.js';
import type { AttributeRef, DerivationRef, SlotRef, SourceRef } from './refs.js';
import type { CoverageReport, LineageNode, FragilityReport, RankedCandidate, EliminatedCandidate } from './decision-payload.js';
import { contractError, type ContractError } from './errors.js';
export const RECEIPT_SCHEMA_V1='camefa.receipt/1' as const;
export const RECEIPT_ADDRESS_EXCLUDED=Object.freeze(['receiptId','sealedAt','cost'] as const);
export type DecisionOutcome='ranked'|'none_qualify'|'abstained';
export interface Decision { readonly outcome:DecisionOutcome; readonly winner:SlotRef|null; readonly ranking:readonly RankedCandidate[]; readonly eliminated:readonly EliminatedCandidate[]; readonly abstentionReason?:'coverage_floor'|'budget_exhausted'; }
export function assertDecisionInvariants(d:Decision):void{switch(d.outcome){case'ranked':if(d.winner===null||d.ranking.length===0)throw new ReceiptInvariantError('ranked outcome requires a winner and non-empty ranking');if(d.abstentionReason!==undefined)throw new ReceiptInvariantError('ranked outcome must not carry an abstention reason');return;case'none_qualify':if(d.winner!==null)throw new ReceiptInvariantError('none_qualify must have null winner');if(d.eliminated.length===0)throw new ReceiptInvariantError('none_qualify requires eliminations');if(d.abstentionReason!==undefined)throw new ReceiptInvariantError('none_qualify must not carry an abstention reason');return;case'abstained':if(d.winner!==null)throw new ReceiptInvariantError('abstained must have null winner');if(d.abstentionReason===undefined)throw new ReceiptInvariantError('abstention requires a reason');return;}}
export class ReceiptInvariantError extends Error { constructor(message:string){super(message);this.name='ReceiptInvariantError'} }
export interface DecisionReceipt { readonly schema:typeof RECEIPT_SCHEMA_V1; readonly receiptId:string; readonly sealedAt:string; readonly epoch:EpochRef; readonly versions:EngineVersions; readonly request:NormalizedRequest; readonly decision:Decision; readonly coverage:CoverageReport; readonly lineage:LineageNode; readonly fragility?:FragilityReport; readonly cost:CostReport; }
export type AddressablePayload=Omit<DecisionReceipt,(typeof RECEIPT_ADDRESS_EXCLUDED)[number]>;
export function addressOf(payload:AddressablePayload):string{return canonicalHash(payload)}
export function sealReceipt(draft:Omit<DecisionReceipt,'receiptId'>):DecisionReceipt{assertDecisionInvariants(draft.decision);const {sealedAt,cost,...addressable}=draft;void sealedAt;void cost;return {...draft,receiptId:addressOf(addressable)}}
export function verifyAddress(receipt:DecisionReceipt):boolean{const {receiptId,sealedAt,cost,...addressable}=receipt;void sealedAt;void cost;return receiptId===addressOf(addressable)}
export function verifyReceipt(receipt:DecisionReceipt,replayedOutput?:unknown):Result<void,ContractError>{if(!verifyAddress(receipt))return err(contractError('INTERNAL','receipt address mismatch',{detail:{receiptId:receipt.receiptId}}));if(replayedOutput!==undefined&&canonicalHash(replayedOutput)!==canonicalHash(receipt.decision))return err(contractError('INTERNAL','replay divergence'));return ok(undefined)}
export const receiptSlug=(r:DecisionReceipt)=>`decision-${r.receiptId.slice(0,16)}`;
export const receiptToJson=(r:DecisionReceipt)=>JSON.stringify(r);
