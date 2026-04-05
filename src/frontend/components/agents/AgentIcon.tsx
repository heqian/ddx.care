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
} from "@heroicons/react/24/outline";
import type { FC } from "react";
import type { SVGProps } from "react";

const IconMap: Record<string, FC<SVGProps<SVGSVGElement>>> = {
  cardiologist: HeartIcon,
  cardiothoracicSurgeon: HeartIcon,
  neurologist: LightBulbIcon,
  neurosurgeon: LightBulbIcon,
  pathologist: BeakerIcon,
  radiologist: EyeIcon,
  orthopedist: UserGroupIcon,
  generalist: AcademicCapIcon,
  pediatrician: UserGroupIcon,
  toxicologist: FireIcon,
  allergistImmunologist: ShieldCheckIcon,
  emergencyPhysician: SparklesIcon,
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
