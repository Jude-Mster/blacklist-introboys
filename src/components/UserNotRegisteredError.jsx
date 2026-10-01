import React from "react";
import AuthLayout from "./AuthLayout";
import { base44 } from "@/api/base44Client";

const UserNotRegisteredError = () => {
  return (
    <AuthLayout title="Access restricted">
      <p className="text-center text-sm text-mist">
        This account isn't allowed into the guild hall yet. Ask the Guild Master to invite you, or log out and use the account you signed up with.
      </p>
      <button type="button" onClick={() => base44.auth.logout("/")} className="btn-bronze mt-5 h-11 w-full">
        Log out
      </button>
    </AuthLayout>
  );
};

export default UserNotRegisteredError;