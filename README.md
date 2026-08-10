# Gestão Contábil Inteligente

Frontend dos módulos de implantação contábil e gestão inteligente de fechamentos.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/237dee04-bb2a-4165-a8e3-381c675f3a5b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Configuração da API

O frontend consome o backend NestJS existente. Configure `VITE_API_URL` no ambiente do Lovable ou em um arquivo `.env.local` durante o desenvolvimento:

```env
VITE_API_URL=https://api.seu-dominio.com.br
```

Sem essa variável, o ambiente local usa `http://localhost:3000`.

Credenciais do PIER e do banco de dados pertencem exclusivamente ao backend e nunca devem ser adicionadas neste repositório.
