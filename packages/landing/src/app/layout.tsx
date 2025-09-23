import type { Metadata } from "next";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./globals.css";
import { styled } from "../../styled-system/jsx";

export const metadata: Metadata = {
  title: "origan.dev",
  description: "Deploy your applications with ease",
};

const StyledBody = styled("body", {
  base: {
    fontFamily: "'Space Mono', monospace",
  },
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <StyledBody>{children}</StyledBody>
    </html>
  );
}
