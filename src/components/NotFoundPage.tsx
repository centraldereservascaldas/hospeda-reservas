import { ArrowRight, Building2, Droplets, Waves } from 'lucide-react';

const suggestions = [
  {
    category: 'condominiums',
    title: 'Condomínios',
    description: 'Explore acomodações em diferentes condomínios de Caldas Novas.',
    icon: Building2,
  },
  {
    category: 'pools_24h',
    title: 'Piscinas 24 horas',
    description: 'Encontre hospedagens com piscinas termais disponíveis o dia todo.',
    icon: Droplets,
  },
  {
    category: 'waterpark_included',
    title: 'Parque aquático incluso',
    description: 'Veja acomodações com acesso ao parque aquático incluído.',
    icon: Waves,
  },
];

export function NotFoundPage() {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-10 text-neutral-900 sm:px-6 sm:py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <a className="w-fit text-lg font-bold tracking-tight text-neutral-900" href="/">
          Central de Reservas <span className="text-orange-700">Caldas Novas</span>
        </a>

        <section
          aria-labelledby="not-found-title"
          className="rounded-3xl border border-orange-950/10 bg-white px-6 py-10 shadow-sm sm:px-12 sm:py-14"
        >
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-orange-800">
            Página não encontrada · 404
          </p>
          <h1
            id="not-found-title"
            className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl"
          >
            Esse endereço mudou de caminho.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
            Não encontramos a página que você abriu. Enquanto isso, descubra hospedagens e encontre
            uma nova opção para aproveitar Caldas Novas.
          </p>
          <a
            className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-800"
            href="/"
          >
            Explorar acomodações <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </section>

        <section aria-labelledby="suggestions-title">
          <h2 id="suggestions-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Conheça algumas opções
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {suggestions.map(({ category, title, description, icon: Icon }) => (
              <a
                key={category}
                className="group flex min-h-52 flex-col rounded-2xl border border-neutral-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-800 motion-reduce:transform-none motion-reduce:transition-none"
                href={`/?category=${category}`}
              >
                <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-orange-50 text-orange-800">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="text-lg font-semibold">{title}</span>
                <span className="mt-2 flex-1 text-sm leading-6 text-neutral-600">
                  {description}
                </span>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-orange-800">
                  Ver opções{' '}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                  />
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
