declare interface EventMetadata {
  service_path?: string;
  execution_id?: string;
}

declare interface EventBoot {
  event_type: "Boot";
  event: {
    boot_time: number;
  };
}

declare interface EventBootFailure {
  event_type: "BootFailure";
  event: {
    msg: string;
  };
}

declare interface EventShutdown {
  event_type: "Shutdown";
  event: {
    reason:
      | "EventLoopCompleted"
      | "WallClockTime"
      | "CPUTime"
      | "Memory"
      | "EarlyDrop"
      | "TerminationRequested";
    cpu_time: number;
    memory_used: {
      total: number;
      heap: number;
      external: number;
      mem_check_captured: number;
    };
  };
}

declare interface EventUncaughtException {
  event_type: "UncaughtException";
  event: {
    exception: string;
    cpu_time_used: number;
  };
}

declare interface EventLog {
  event_type: "Log";
  event: {
    msg: string;
    level: "Error" | "Warning" | "Info" | "Debug";
  };
}

interface BaseEventValue {
  timestamp: string;
  metadata: EventMetadata;
}

declare type EventValue = BaseEventValue &
  (
    | EventBoot
    | EventBootFailure
    | EventShutdown
    | EventUncaughtException
    | EventLog
  );

declare interface Event {
  value: EventValue;
  done: boolean;
}

declare class SupabaseEventListener {
  nextEvent(): Promise<Event>;

  [Symbol.asyncIterator](): AsyncIterableIterator<EventValue>;
}

export { SupabaseEventListener };

declare global {
  var EventManager: typeof SupabaseEventListener;
}
