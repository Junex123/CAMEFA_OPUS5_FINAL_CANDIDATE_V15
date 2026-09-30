import type { AttributeRef, SlotRef } from './refs.js';
import type { LineageNode } from './lineage.js';
export interface RankedCandidate { readonly slot: SlotRef; readonly score: number; }
export type EliminationReason =
 | { readonly kind:'hard_constraint'; readonly attribute:AttributeRef; readonly detail:string }
 | { readonly kind:'insufficient_coverage'; readonly attributes:readonly AttributeRef[] };
export interface EliminatedCandidate { readonly slot:SlotRef; readonly reason:EliminationReason; }
export interface CoverageReport { readonly belowFloor:boolean; readonly withheldByLicense:number; readonly perAttribute:readonly {attribute:AttributeRef;sources:number}[]; }
export type { LineageNode };
export type FragilityBand='robust'|'sensitive'|'knife_edge';
export interface FragilityReport { readonly band:FragilityBand; readonly partial:boolean; readonly slots:readonly {slot:SlotRef;multiplierToFlip:number}[]; }
export interface Claim { readonly id:string; readonly entityId:string; readonly attributeKey:string; readonly value:unknown; readonly validFrom:string; readonly validTo:string|null; readonly sourceId:string; readonly confidence:number; readonly provenance?:unknown; readonly retractedAt?:string|null; }

export interface BindingConstraint { readonly requirement: string; readonly margin: number; }
