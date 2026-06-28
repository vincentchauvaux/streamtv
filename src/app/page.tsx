import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calendar,
  Clock,
  Heart,
  Play,
  Search,
  Sparkles,
  Tv,
  Zap,
} from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  const features = [
    {
      icon: Tv,
      title: "Playlists M3U",
      desc: "Importez vos chaînes depuis n'importe quelle URL M3U/M3U8",
    },
    {
      icon: Calendar,
      title: "Guide TV",
      desc: "Programmes en direct et à venir via XMLTV",
    },
    {
      icon: Heart,
      title: "Favoris sync",
      desc: "Vos chaînes préférées, synchronisées sur tous vos appareils",
    },
    {
      icon: Search,
      title: "Recherche",
      desc: "Trouvez une chaîne ou un programme instantanément",
    },
    {
      icon: Clock,
      title: "Reprise",
      desc: "Reprenez là où vous vous êtes arrêté",
    },
    {
      icon: Zap,
      title: "Lecteur HLS",
      desc: "Lecture fluide avec hls.js, plein écran et raccourcis clavier",
    },
  ];

  return (
    <div className="bg-mesh min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <span className="text-2xl font-bold gradient-text">StreamTV</span>
        </div>
        <Link
          href="#connexion"
          className="rounded-xl border border-border bg-surface/50 px-5 py-2.5 text-sm font-medium transition-all hover:border-primary/40 hover:bg-surface"
        >
          Connexion
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-8 text-center lg:pt-20">
        <div className="animate-fade-in mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-2 text-sm text-muted backdrop-blur-sm">
          <Play className="h-3.5 w-3.5 text-accent" />
          Lecteur IPTV moderne · Mode sombre
        </div>

        <h1 className="animate-fade-in stagger-1 mx-auto max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight lg:text-6xl">
          Vos chaînes TV,{" "}
          <span className="gradient-text">belles et synchronisées</span>
        </h1>

        <p className="animate-fade-in stagger-2 mx-auto mt-6 max-w-xl text-lg text-muted">
          Importez une playlist M3U, consultez le guide TV, gérez vos favoris et
          reprenez la lecture là où vous l&apos;avez laissée — sur mobile, desktop ou TV.
        </p>

        <div className="animate-fade-in stagger-3 mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="#connexion"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 font-medium text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover hover:shadow-primary/40"
          >
            <Sparkles className="h-4 w-4" />
            Commencer gratuitement
          </Link>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="animate-fade-in rounded-2xl border border-border bg-surface/60 p-6 text-left backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-surface"
              style={{ animationDelay: `${0.1 + i * 0.05}s` }}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="connexion"
        className="border-t border-border-subtle bg-surface/30 py-20 backdrop-blur-sm"
      >
        <div className="mx-auto grid max-w-4xl gap-10 px-6 lg:grid-cols-2">
          <div className="animate-fade-in">
            <h2 className="text-2xl font-bold">Connexion</h2>
            <p className="mt-2 text-muted">Accédez à vos playlists et favoris</p>
            <div className="mt-6 rounded-2xl border border-border bg-background/80 p-6 backdrop-blur-sm">
              <AuthForm mode="login" />
            </div>
          </div>
          <div className="animate-fade-in stagger-2">
            <h2 className="text-2xl font-bold">Créer un compte</h2>
            <p className="mt-2 text-muted">Gratuit — synchronisation incluse</p>
            <div className="mt-6 rounded-2xl border border-border bg-background/80 p-6 backdrop-blur-sm">
              <AuthForm mode="register" />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border-subtle py-8 text-center text-sm text-muted">
        StreamTV — Lecteur IPTV personnel. Aucun contenu fourni.
      </footer>
    </div>
  );
}
