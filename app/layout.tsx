import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weekender — your local events concierge",
  description:
    "A concierge that finds events matching your taste, budget, and travel range — then hands you the booking link.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
