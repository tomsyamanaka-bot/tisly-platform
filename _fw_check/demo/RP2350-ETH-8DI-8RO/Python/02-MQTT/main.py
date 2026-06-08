from machine import Pin
from time import sleep
import network
from umqtt.simple import MQTTClient
import config
import ujson
import time

# Initialize RELAY pin array (GPIO 17~24)
RELAYS = [Pin(pin, Pin.OUT) for pin in range(17, 25)]

# Initialize all relays to the closed state (low level)
def init_relays():
    for relay in RELAYS:
        relay.value(0)  # 0 = OFF, 1 = ON
    print("Relays initialized (OFF)")
    
# Control one relay
def set_relay(relay_num, state):
    if 1 <= relay_num <= len(RELAYS):
        RELAYS[relay_num - 1].value(state)  
        print(f"CH{relay_num} set to {'ON' if state else 'OFF'}")
    else:
        print(f"Error: CH number must be 1~{len(RELAYS)}")

# Control all relays
def set_all_relays(state):
    for i in range(len(RELAYS)):
        RELAYS[i].value(state)
    print(f"ALL CH set to {'ON' if state else 'OFF'}")

# Constants for MQTT Topics
MQTT_SUB_TOPIC = 'Sub/89/54/2d6d13f0'
MQTT_PUB_TOPIC = 'Pub/89/54/2d6d13f0'

# MQTT Parameters
MQTT_SERVER = config.mqtt_server
MQTT_PORT = config.mqtt_port
MQTT_USERNAME = config.mqtt_username
MQTT_PASSWORD = config.mqtt_password
MQTT_CLIENT_ID = config.mqtt_client_id
MQTT_KEEPALIVE = config.mqtt_keepalive
MQTT_SSL = False  
MQTT_SSL_PARAMS = None

# Init W5500 Ethernet Interface
def ethernet_init():
    try:
        # Initialize W5500
        nic = network.WIZNET5K()
        nic.active(True)
        
        # Configure DHCP
        nic.ifconfig('dhcp')
        
        print('Waiting for Ethernet connection...')
        
        # Wait for Ethernet connection
        connection_timeout = 20
        while connection_timeout > 0:
            if nic.isconnected():
                network_info = nic.ifconfig()
                print('Ethernet connection successful!')
                print('IP address:', network_info[0])
                return True
            connection_timeout -= 1
            print('.', end='')
            sleep(1)
        
        print('\nEthernet connection timeout!')
        return False
        
    except Exception as e:
        print('Ethernet initialization error:', e)
        return False

# Connect to MQTT Broker
def mqtt_connect():
    try:
        client = MQTTClient(client_id=MQTT_CLIENT_ID,
                            server=MQTT_SERVER,
                            port=MQTT_PORT,
                            user=MQTT_USERNAME,
                            password=MQTT_PASSWORD,
                            keepalive=MQTT_KEEPALIVE,
                            ssl=MQTT_SSL,
                            ssl_params=MQTT_SSL_PARAMS)
        client.connect()
        return client
    except Exception as e:
        print('Error connecting to MQTT:', e)
        return None

# Subcribe to MQTT topics
def mqtt_subscribe(client, topic):
    client.subscribe(topic)
    print('Subscribe to topic:', topic)
    
# Publish MQTT message
def mqtt_publish(client, topic, message, retain=False, qos=0):
    try:
        client.publish(topic, message, retain=retain, qos=qos)
        print(f"Published: {message} -> {topic}")
    except Exception as e:
        print("Publish error:", e)
    
# Callback function that runs when you receive a message on subscribed topic
def mqtt_recv_callback(topic, message):
    try:
        msg = ujson.loads(message.decode('utf-8'))
        data = msg.get("data", {})
        
        if not data:
            print("Error: 'data' field missing")
            return
            
        # Parsing the data
        key, value = next(iter(data.items())) 
        
        # Verify data
        if value not in (0, 1):
            print(f"Error: Value must be 0 or 1, got {value}")
            return
            
        if key.startswith("CH"):
            relay_num = int(key[2:])
            if 1 <= relay_num <= 8:
                set_relay(relay_num, value)
                mqtt_publish(client, MQTT_PUB_TOPIC, f'{{"{key}":{value}}}', retain=True)
            else:
                print(f"Error: Relay number must be 1-8, got {relay_num}")
        elif key == "ALL":
            set_all_relays(value)
            mqtt_publish(client, MQTT_PUB_TOPIC, f'{{"ALL":{value}}}', retain=True)
        else:
            print(f"Error: Unknown key '{key}'")
            
    except ValueError as e:
        print("JSON decode error:", e)
    except Exception as e:
        print("Unexpected error:", e)
    
try:
    # Initialize RELAY
    init_relays()
    
    # Initialize Ethernet (W5500)
    if not ethernet_init():
        print('Error connecting to the network... exiting program')
    else:
        # Connect to MQTT broker, start MQTT client
        client = mqtt_connect()
        if client:
            client.set_callback(mqtt_recv_callback)
            mqtt_subscribe(client, MQTT_SUB_TOPIC)
            
            mqtt_publish(client, MQTT_PUB_TOPIC, '{"status":"online"}', retain=True)
            
            # Keepalive
            last_ping = time.time()
            
            # Continuously checking for messages
            while True:
                client.check_msg()
                sleep(0.1)
                
                if time.time() - last_ping > 20:
                    client.ping()
                    last_ping = time.time()
        else:
            print('Failed to connect to MQTT broker')
            
except Exception as e:
    print('Error:', e)
