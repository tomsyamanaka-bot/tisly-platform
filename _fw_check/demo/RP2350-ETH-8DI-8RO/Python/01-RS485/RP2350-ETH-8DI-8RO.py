from machine import UART, Pin, PWM
import time

# Hardware Configuration
UART_ID = 1  
BAUD_RATE = 9600
UART_TX_PIN = 4  
UART_RX_PIN = 5
RELAY_PINS = [17, 18, 19, 20, 21, 22, 23, 24]
INPUT_PINS = [9, 10, 11, 12, 13, 14, 15, 16]  # GP9~GP16 input pins
BUZZER_PIN = 3  

# Relay control commands
relay_commands = [
    bytes([0x06, 0x05, 0x00, 0x01, 0x55, 0x00, 0xA2, 0xED]),  # CH1
    bytes([0x06, 0x05, 0x00, 0x02, 0x55, 0x00, 0x52, 0xED]),  # CH2
    bytes([0x06, 0x05, 0x00, 0x03, 0x55, 0x00, 0x03, 0x2D]),  # CH3
    bytes([0x06, 0x05, 0x00, 0x04, 0x55, 0x00, 0xB2, 0xEC]),  # CH4
    bytes([0x06, 0x05, 0x00, 0x05, 0x55, 0x00, 0xE3, 0x2C]),  # CH5
    bytes([0x06, 0x05, 0x00, 0x06, 0x55, 0x00, 0x13, 0x2C]),  # CH6
    bytes([0x06, 0x05, 0x00, 0x07, 0x55, 0x00, 0x42, 0xEC]),  # CH7
    bytes([0x06, 0x05, 0x00, 0x08, 0x55, 0x00, 0x72, 0xEF]),  # CH8
    bytes([0x06, 0x05, 0x00, 0xFF, 0xFF, 0x00, 0xBD, 0xBD]),  # ALL ON
    bytes([0x06, 0x05, 0x00, 0xFF, 0x00, 0x00, 0xFC, 0x4D])   # ALL OFF
]

# Global variables
uart = None
relays = []
inputs = []
relay_status = []
buzzer = None

# Debounce timers for each input (milliseconds)
last_interrupt_time = [0] * 8
DEBOUNCE_TIME_MS = 100  # 500ms debounce time

# Create separate interrupt handler for each input pin
def create_interrupt_handler(index):
    def interrupt_handler(pin):
        global last_interrupt_time
        
        # Get current time
        current_time = time.ticks_ms()
        
        # Check if enough time has passed since last interrupt
        if time.ticks_diff(current_time, last_interrupt_time[index]) < DEBOUNCE_TIME_MS:
            return  # Ignore this interrupt (debounce)
        
        # Update last interrupt time
        last_interrupt_time[index] = current_time
        
        # Read input pin state
        input_state = pin.value()
        
        # Low level turns relay ON, high level turns relay OFF
        if input_state == 0:  # Low level
            relays[index].value(1)  # Turn relay ON
            relay_status[index] = 1
            print(f"Input {index+1} (GP{INPUT_PINS[index]}) LOW -> Relay CH{index+1} ON")
        else:  # High level
            relays[index].value(0)  # Turn relay OFF
            relay_status[index] = 0
            print(f"Input {index+1} (GP{INPUT_PINS[index]}) HIGH -> Relay CH{index+1} OFF")
    
    return interrupt_handler

# Initialize the hardware
def hardware_init():
    global uart, relays, inputs, relay_status, buzzer
    
    # UART initialization
    uart = UART(UART_ID, baudrate=BAUD_RATE, tx=Pin(UART_TX_PIN), rx=Pin(UART_RX_PIN))
    
    # Relay GPIO initialization
    relays = [Pin(pin, Pin.OUT) for pin in RELAY_PINS]
    relay_status = [0] * len(RELAY_PINS)
    
    # Input GPIO initialization with interrupt
    inputs = []
    for i, pin_num in enumerate(INPUT_PINS):
        # Configure as input mode with pull-up resistor (default high level)
        input_pin = Pin(pin_num, Pin.IN, Pin.PULL_UP)
        
        # Create dedicated interrupt handler for each pin
        interrupt_handler = create_interrupt_handler(i)
        
        # Set interrupt: trigger on both falling edge (low) and rising edge (high)
        input_pin.irq(trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, handler=interrupt_handler)
        
        inputs.append(input_pin)
    
    # Initialize buzzer PWM
    buzzer = PWM(Pin(BUZZER_PIN))
    buzzer.freq(2000)
    buzzer.duty_u16(0)

# Buzzer tone
def beep(duration_ms=100):
    buzzer.duty_u16(32768)  
    time.sleep_ms(duration_ms)
    buzzer.duty_u16(0)

# Relay control function
def relay_control(index):
    if index < 8: 
        relay_status[index] = not relay_status[index]
        relays[index].value(relay_status[index])
        print("|*** Expansion channel %d %s ***|" % (index + 1, "ON" if relay_status[index] else "OFF"))
        
    elif index == 8:  # ALL ON
        for i in range(8):
            relays[i].value(1)
            relay_status[i] = 1
        print("|*** Enable all extension channels ***|")
        
    elif index == 9:  # ALL OFF
        for i in range(8):
            relays[i].value(0)
            relay_status[i] = 0
        print("|*** Close all expansion channels ***|")
    
    beep()

# Check input states and update relays (for initialization or manual check)
def check_inputs_and_update_relays():
    for i, input_pin in enumerate(inputs):
        input_state = input_pin.value()
        
        # Low level turns relay ON, high level turns relay OFF
        if input_state == 0:  # Low level
            relays[i].value(1)  # Turn relay ON
            relay_status[i] = 1
        else:  # High level
            relays[i].value(0)  # Turn relay OFF
            relay_status[i] = 0

def main():
    hardware_init()
    rx_buf = bytearray(20)
    
    # Initial check of input states
    check_inputs_and_update_relays()
    print("System started.\nInput monitoring active.")
    
    while True:
        if uart.any():
            # Waiting for data reception to complete
            time.sleep_ms(2) 
            rx_len = uart.readinto(rx_buf)
            
            # Valid command length
            if rx_len == 8:  
                # Command matching
                matched = False
                for i in range(10):
                    if rx_buf[:8] == relay_commands[i]:
                        relay_control(i)
                        matched = True
                        break
                
                if not matched:
                    print("Note: Non-instruction data received - RS485!")
            else:
                print(f"Note: Invalid data length {rx_len} - RS485!")
            
            # Clear the buffer
            for i in range(20):
                rx_buf[i] = 0
        
        # Short delay to reduce CPU usage
        time.sleep_ms(10)

if __name__ == "__main__":
    main()
