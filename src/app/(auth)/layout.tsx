import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bloom relative flex min-h-screen flex-col">
      <div className="container-x relative flex h-16 items-center">
        <Logo />
      </div>
      <div className="container-x relative flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
