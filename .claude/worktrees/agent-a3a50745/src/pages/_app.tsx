import type { AppProps } from "next/app";
import "@/styles/globals.css";
import AppQueryProvider from "../providers/QueryProvider";

export default function App({ Component, pageProps }: AppProps) {
    return (
        <AppQueryProvider>
            <Component {...pageProps} />
        </AppQueryProvider>
    );
}
