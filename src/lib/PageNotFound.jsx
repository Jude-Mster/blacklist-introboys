import React from "react";
import { Link } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";

export default function PageNotFound() {
  return (
    <AuthLayout title="Lost in the clouds">
      <p className="text-center text-sm text-mist">This path leads nowhere. Head back to the guild hall.</p>
      <Link to="/dashboard" className="btn-seal mt-5 h-11 w-full">
        Back to the hall
      </Link>
    </AuthLayout>
  );
}