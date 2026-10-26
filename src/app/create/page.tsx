import type { Metadata } from "next";
import { CreatePartyForm } from "./create-form";

export const metadata: Metadata = { title: "Start a party" };

export default function CreatePage() {
  return <CreatePartyForm />;
}
