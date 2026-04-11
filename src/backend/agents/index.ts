import type { Agent } from "@mastra/core/agent";

// Primary Care
import { generalist } from "./generalist";
import { pediatrician } from "./pediatrician";
import { geriatrician } from "./geriatrician";

// Internal Medicine Subspecialties
import { cardiologist } from "./cardiologist";
import { dermatologist } from "./dermatologist";
import { endocrinologist } from "./endocrinologist";
import { gastroenterologist } from "./gastroenterologist";
import { hematologist } from "./hematologist";
import { infectiologist } from "./infectiologist";
import { nephrologist } from "./nephrologist";
import { neurologist } from "./neurologist";
import { oncologist } from "./oncologist";
import { pulmonologist } from "./pulmonologist";
import { rheumatologist } from "./rheumatologist";

// Surgical Specialties
import { generalSurgeon } from "./general-surgeon";
import { cardiothoracicSurgeon } from "./cardiothoracic-surgeon";
import { neurosurgeon } from "./neurosurgeon";
import { orthopedist } from "./orthopedist";
import { otolaryngologist } from "./otolaryngologist";
import { urologist } from "./urologist";
import { vascularSurgeon } from "./vascular-surgeon";

// Diagnostic & Support
import { pathologist } from "./pathologist";
import { radiologist } from "./radiologist";
import { geneticist } from "./geneticist";

// Reproductive & Gender-Specific
import { obstetricianGynecologist } from "./obstetrician-gynecologist";
import { andrologist } from "./andrologist";
import { maternalFetalMedicine } from "./maternal-fetal-medicine";

// Mental & Behavioral Health
import { psychiatrist } from "./psychiatrist";

// Critical Care & Emergency Subspecialties
import { intensivist } from "./intensivist";
import { toxicologist } from "./toxicologist";

// Other Specialized Fields
import { allergistImmunologist } from "./allergist-immunologist";
import { ophthalmologist } from "./ophthalmologist";
import { emergencyPhysician } from "./emergency-physician";
import { sportsMedicinePhysician } from "./sports-medicine-physician";
import { podiatrist } from "./podiatrist";

/** All specialist agents (excludes the CMO orchestrator) */
export const specialists = {
  // Primary Care
  generalist,
  pediatrician,
  geriatrician,
  // Internal Medicine Subspecialties
  cardiologist,
  dermatologist,
  endocrinologist,
  gastroenterologist,
  hematologist,
  infectiologist,
  nephrologist,
  neurologist,
  oncologist,
  pulmonologist,
  rheumatologist,
  // Surgical Specialties
  generalSurgeon,
  cardiothoracicSurgeon,
  neurosurgeon,
  orthopedist,
  otolaryngologist,
  urologist,
  vascularSurgeon,
  // Diagnostic & Support
  pathologist,
  radiologist,
  geneticist,
  // Reproductive & Gender-Specific
  obstetricianGynecologist,
  andrologist,
  maternalFetalMedicine,
  // Mental & Behavioral Health
  psychiatrist,
  // Critical Care & Emergency Subspecialties
  intensivist,
  toxicologist,
  // Other Specialized Fields
  allergistImmunologist,
  ophthalmologist,
  emergencyPhysician,
  sportsMedicinePhysician,
  podiatrist,
} satisfies Record<string, Agent>;

/** Specialist agent IDs (camelCase, matching agent record keys) */
export type SpecialistId = keyof typeof specialists;

/** List of agent metadata for the /v1/agents endpoint */
export const agentList = Object.entries(specialists).map(([id, agent]) => ({
  id,
  name: agent.name,
  description: agent.getDescription(),
}));
