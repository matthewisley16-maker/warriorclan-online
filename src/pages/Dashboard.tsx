import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PawPrint, LogOut } from "lucide-react";
import { useNavigate } from "react-router";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <PawPrint className="size-7 text-primary" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">
          Welcome{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ThunderClan is waiting for you, {user?.name ? `${user.name}` : "warrior"}. Your journey through the forest begins here.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" onClick={() => navigate("/play")} className="gap-2">
            <PawPrint className="size-4" />
            Enter the forest
          </Button>
          <Button variant="ghost" onClick={handleSignOut} className="gap-2 text-muted-foreground">
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
