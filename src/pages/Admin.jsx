import React from "react";
import { Navigate } from "react-router-dom";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild } from "@/lib/GuildContext";
import AwardSection from "@/components/admin/AwardSection";
import BanSection from "@/components/admin/BanSection";
import SettingsSection from "@/components/admin/SettingsSection";
import ImportSection from "@/components/admin/ImportSection";
import TotalsSection from "@/components/admin/TotalsSection";

export default function Admin() {
  const { account, loading } = useGuild();

  if (loading) return <LanternSpinner label="Checking your rank" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;

  const role = account.member.role;
  if (role !== "officer" && role !== "leader") {
    return (
      <Panel className="p-8 text-center max-w-md mx-auto mt-10">
        <h1 className="font-heading text-xl text-ember">Not authorized</h1>
        <p className="text-muted-foreground text-sm mt-2">Only officers and the leader may enter the admin hall.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-heading text-3xl text-gold font-bold">Admin Hall</h1>
        <p className="text-muted-foreground text-sm mt-1 capitalize">{role} access</p>
      </div>

      <TotalsSection />
      <AwardSection />
      <BanSection />
      {role === "leader" && <SettingsSection />}
      {role === "leader" && <ImportSection />}
    </div>
  );
}