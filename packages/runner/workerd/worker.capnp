using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (
      name = "internet",
      network = (
        allow = ["public", "private"],
        tlsOptions = (trustBrowserCas = true)
      )
    ),
    (
      name = "parent",
      worker = (
        compatibilityDate = "2026-01-01",
        compatibilityFlags = ["nodejs_compat", "nodejs_compat_populate_process_env"],
        modules = [
          (name = "parent.mjs", esModule = embed "parent.mjs"),
          (name = "aws4fetch.mjs", esModule = embed "aws4fetch.mjs")
        ],
        bindings = [
          (name = "USER_LOADER", workerLoader = (id = "origan-user-loader")),
          (name = "BUCKET_URL", fromEnvironment = "BUCKET_URL"),
          (name = "BUCKET_NAME", fromEnvironment = "BUCKET_NAME"),
          (name = "BUCKET_REGION", fromEnvironment = "BUCKET_REGION"),
          (name = "BUCKET_ACCESS_KEY", fromEnvironment = "BUCKET_ACCESS_KEY"),
          (name = "BUCKET_SECRET_KEY", fromEnvironment = "BUCKET_SECRET_KEY"),
          (name = "EVENTS_NATS_WS_SERVER", fromEnvironment = "EVENTS_NATS_WS_SERVER")
        ]
      )
    )
  ],
  sockets = [
    (
      name = "http",
      address = "0.0.0.0:9000",
      http = (),
      service = "parent"
    )
  ]
);
