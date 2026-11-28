import { Redirect } from "expo-router";

/** Legacy route — Barbershop is now /beauty/c/barbershop */
export default function BeautyBarbershopRedirect() {
  return <Redirect href={"/beauty/c/barbershop" as any} />;
}
