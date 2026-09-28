import "./globals.css";

export const metadata = { title: "Meu caixa", description: "Controle financeiro pessoal" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
