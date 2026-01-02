using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (
      name = "parent",
      worker = (
        compatibilityDate = "2026-01-01",
        compatibilityFlags = ["nodejs_compat", "nodejs_compat_populate_process_env"],
        modules = [
          (name = "parent.mjs", esModule = embed "parent.mjs")
        ],
        bindings = [
          (name = "USER_LOADER", workerLoader = (id = "origan-test-loader"))
        ]
      )
    )
  ],
  sockets = [
    (
      name = "http",
      address = "0.0.0.0:9010",
      http = (),
      service = "parent"
    )
  ]
);
