mod auth;
mod config;
mod db;
mod http;
mod m3u;
mod normalize;
mod outbound;
mod proxy;
mod rate;
mod xmltv;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::connect_info::IntoMakeServiceWithConnectInfo;

use crate::config::Config;
use crate::db::Db;
use crate::http::{http_client_shared, router, App};
use crate::proxy::ProxyTokens;
use crate::rate::RateLimiter;

#[tokio::main]
async fn main() {
    let cfg = Config::load().unwrap_or_else(|e| {
        eprintln!("Configuration : {e}");
        std::process::exit(1);
    });
    let db = Db::open(&cfg.db_path).unwrap_or_else(|e| {
        eprintln!("Base : {e}");
        std::process::exit(1);
    });
    println!(
        "StreamTV écoute {} — SQLite {}",
        cfg.listen,
        cfg.db_path.display()
    );
    let listen = cfg.listen;
    let app = Arc::new(App {
        db,
        cfg,
        tokens: ProxyTokens::new(),
        rate: RateLimiter::new(),
        http: http_client_shared(),
    });
    let svc: IntoMakeServiceWithConnectInfo<axum::Router, SocketAddr> =
        router(app).into_make_service_with_connect_info::<SocketAddr>();
    let listener = tokio::net::TcpListener::bind(listen).await.unwrap_or_else(|e| {
        eprintln!("Bind {listen} : {e}");
        std::process::exit(1);
    });
    axum::serve(listener, svc).await.expect("serveur");
}
