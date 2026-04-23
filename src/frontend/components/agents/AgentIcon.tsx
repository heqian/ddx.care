import {
  HeartIcon,
  BeakerIcon,
  EyeIcon,
  UserGroupIcon,
  FireIcon,
  ShieldCheckIcon,
  SparklesIcon,
  AcademicCapIcon,
  LightBulbIcon,
  UserIcon,
  UsersIcon,
  SunIcon,
  Cog6ToothIcon,
  ClipboardDocumentIcon,
  EyeDropperIcon,
  BugAntIcon,
  FunnelIcon,
  BookmarkIcon,
  CloudIcon,
  HandRaisedIcon,
  BoltIcon,
  WrenchIcon,
  SpeakerWaveIcon,
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  PuzzlePieceIcon,
  UserCircleIcon,
  UserPlusIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  TrophyIcon,
  ArrowDownCircleIcon,
} from "@heroicons/react/24/outline";
import type { FC } from "react";
import type { SVGProps } from "react";

const IconMap: Record<string, FC<SVGProps<SVGSVGElement>>> = {
  // Primary Care
  generalist: AcademicCapIcon,
  pediatrician: UserGroupIcon,
  geriatrician: UserIcon,
  // Internal Medicine
  cardiologist: HeartIcon,
  dermatologist: SunIcon,
  endocrinologist: Cog6ToothIcon,
  gastroenterologist: ClipboardDocumentIcon,
  hematologist: EyeDropperIcon,
  infectiologist: BugAntIcon,
  nephrologist: FunnelIcon,
  neurologist: LightBulbIcon,
  oncologist: BookmarkIcon,
  pulmonologist: CloudIcon,
  rheumatologist: HandRaisedIcon,
  // Surgical
  generalSurgeon: BoltIcon,
  cardiothoracicSurgeon: HeartIcon,
  neurosurgeon: LightBulbIcon,
  orthopedist: WrenchIcon,
  otolaryngologist: SpeakerWaveIcon,
  urologist: ArrowPathIcon,
  vascularSurgeon: ArrowsPointingOutIcon,
  // Diagnostic & Support
  pathologist: BeakerIcon,
  radiologist: EyeIcon,
  geneticist: PuzzlePieceIcon,
  // Reproductive
  obstetricianGynecologist: UsersIcon,
  andrologist: UserCircleIcon,
  maternalFetalMedicine: UserPlusIcon,
  // Mental Health
  psychiatrist: ChatBubbleLeftRightIcon,
  // Critical Care & Emergency
  intensivist: ClockIcon,
  toxicologist: FireIcon,
  // Other
  allergistImmunologist: ShieldCheckIcon,
  ophthalmologist: MagnifyingGlassIcon,
  emergencyPhysician: SparklesIcon,
  sportsMedicinePhysician: TrophyIcon,
  podiatrist: ArrowDownCircleIcon,
};

export function AgentIcon({
  agentId,
  className = "h-5 w-5",
}: {
  agentId: string;
  className?: string;
}) {
  const Icon = IconMap[agentId] || AcademicCapIcon;
  return <Icon className={className} />;
}
