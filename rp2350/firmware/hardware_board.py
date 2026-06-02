"""GPIO and relay control for Waveshare RP2350-POE-ETH-8DI-8RO."""

from config_loader import gpio_pin_lists, load_device, load_gpio


class Board:
    def __init__(self):
        self._cfg = load_device()
        self._gpio = load_gpio()
        self._active_low = self._cfg.get("active_low", True)
        self._di_pins = []
        self._ro_pins = []
        self._buzzer = None
        self._simulation = False
        self._sim_di = [0] * 8
        self._sim_ro = [0] * 8
        self._init_pins()

    def _init_pins(self):
        di_nums, ro_nums, buzzer = gpio_pin_lists(self._gpio)
        if not di_nums and not ro_nums:
            print("WARN: gpio_map pins unset — simulation mode (8DI/8RO)")
            self._simulation = True
            return

        from machine import Pin

        pull = Pin.PULL_UP if self._active_low else Pin.PULL_DOWN
        for n in di_nums:
            self._di_pins.append(Pin(n, Pin.IN, pull))
        for n in ro_nums:
            p = Pin(n, Pin.OUT)
            p.value(0)
            self._ro_pins.append(p)
        if buzzer is not None:
            from machine import Pin

            self._buzzer = Pin(buzzer, Pin.OUT)
            self._buzzer.value(0)

    def di_count(self):
        return 8 if self._simulation else len(self._di_pins)

    def ro_count(self):
        return 8 if self._simulation else len(self._ro_pins)

    def read_di(self, index):
        if self._simulation:
            if 0 <= index < 8:
                return self._sim_di[index]
            return 0
        if index < 0 or index >= len(self._di_pins):
            return 0
        raw = self._di_pins[index].value()
        if self._active_low:
            return 1 if raw == 0 else 0
        return 1 if raw == 1 else 0

    def set_relay(self, index, on):
        if self._simulation:
            if 0 <= index < 8:
                self._sim_ro[index] = 1 if on else 0
            return
        if index < 0 or index >= len(self._ro_pins):
            return
        self._ro_pins[index].value(1 if on else 0)

    def relay_state(self, index):
        if self._simulation:
            if 0 <= index < 8:
                return self._sim_ro[index]
            return 0
        if index < 0 or index >= len(self._ro_pins):
            return 0
        return self._ro_pins[index].value()

    def all_relays_on(self):
        for i in range(self.ro_count()):
            self.set_relay(i, True)

    def all_relays_off(self):
        for i in range(self.ro_count()):
            self.set_relay(i, False)
