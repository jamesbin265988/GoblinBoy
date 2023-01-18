mod api;
mod database;
mod engine;
mod websocket;

use ae_position::Dimensions2d;
use api::{ClientMessage, ServerMessageAllClients, ServerMessageSingleClient};
use bevy::prelude::*;
use database::{Database, DatabaseLock};
use engine::{
    app::start_game_engine,
    components::UserId,
    resources::map::{MAP_HEIGHT, MAP_WIDTH},
};
use std::sync::Arc;
use tokio::sync::{
    mpsc::{self, UnboundedSender},
    RwLock,
};
use warp::{ws::Message, Filter};
use websocket::{connections::ConnectionsLock, new_connection::handle_new_connection};

fn main() {
    let (client_sender, client_receiver) = mpsc::unbounded_channel::<(UserId, ClientMessage)>();
    let (server_sender_single_client, mut server_receiver_single_client) =
        mpsc::unbounded_channel::<(UserId, ServerMessageSingleClient)>();
    let (server_sender_all_clients, mut server_receiver_all_clients) =
        mpsc::unbounded_channel::<ServerMessageAllClients>();

    // Initialize the Bevy game engine
    std::thread::spawn(move || {
        start_game_engine(
            client_receiver,
            server_sender_single_client,
            server_sender_all_clients,
        );
    });

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            pretty_env_logger::init();

            // Database setup
            // Initiate a connection to the database file, creating the file if required.
            let database = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(5)
                .connect_with(
                    sqlx::sqlite::SqliteConnectOptions::new()
                        .filename("database.sqlite")
                        .create_if_missing(true),
                )
                .await
                .expect("Couldn't connect to database");

            // Run migrations, which updates the database's schema to the latest version.
            sqlx::migrate!("./migrations")
                .run(&database)
                .await
                .expect("Couldn't run database migrations");

            let db: DatabaseLock = Arc::new(RwLock::new(Database(database)));
            let db = warp::any().map(move || db.clone());

            let sender = warp::any().map(move || client_sender.clone());

            // Websocket setup
            let connections = ConnectionsLock::default();
            let connections_2 = connections.clone();
            let connections_3 = connections.clone();

            let connections = warp::any().map(move || connections.clone());

            tokio::task::spawn(async move {
                while let Some(all_clients_message) = server_receiver_all_clients.recv().await {
                    let serialized_message: String =
                        serde_json::to_string(&all_clients_message).expect("Serialize should work");

                    info!("Sending to all: {}", serialized_message);
                    for (&_uid, sender) in connections_2.read().await.0.iter() {
                        sender.send(Message::text(&serialized_message)).ok();
                    }
                }
            });

            tokio::task::spawn(async move {
                while let Some((user_id, single_client_message)) =
                    server_receiver_single_client.recv().await
                {
                    let serialized_message: String = serde_json::to_string(&single_client_message)
                        .expect("Serialize should work");

                    info!("Sending only to user {}: {}", user_id.0, serialized_message);

                    for (&uid, sender) in connections_3.read().await.0.iter() {
                        if uid == user_id.0 {
                            sender.send(Message::text(&serialized_message)).ok();
                        }
                    }
                }
            });

            // GET /game -> websocket upgrade
            let game = warp::path!("api" / "game")
                // The `ws()` filter will prepare Websocket handshake...
                .and(warp::ws())
                .and(connections)
                .and(db)
                .and(sender)
                .map(
                    |ws: warp::ws::Ws,
                     connections: ConnectionsLock,
                     db: DatabaseLock,
                     sender: UnboundedSender<(UserId, ClientMessage)>| {
                        // This will call our function if the handshake succeeds.
                        ws.on_upgrade(move |socket| {
                            handle_new_connection(socket, connections, db, sender)
                        })
                    },
                );

            let any_origin_get = warp::cors().allow_any_origin().allow_method("GET");

            // GET /game-config returns a `200 OK` with a JSON array of ids:
            let game_config = warp::path!("api" / "game-config")
                .map(|| {
                    warp::reply::json(&Dimensions2d {
                        width: MAP_WIDTH,
                        height: MAP_HEIGHT,
                    })
                })
                .with(any_origin_get);

            // // GET / -> index html
            // let index = warp::path::end()
            //     .map(|| warp::reply::html(r#"<html>There is nothing to see here.</html>"#));

            // Serve static directory -- not currently used
            let index = warp::fs::dir("client/dist");

            let routes = index.or(game_config).or(game);

            warp::serve(routes).run(([0, 0, 0, 0], 8080)).await;
        });
}
