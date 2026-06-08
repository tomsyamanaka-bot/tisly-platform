/**
 * Copyright (c) 2022 WIZnet Co.,Ltd
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#ifndef _NETCHIP_GPIO_IRQ_H_
#define _NETCHIP_GPIO_IRQ_H_

/**
 * ----------------------------------------------------------------------------------------------------
 * Macros
 * ----------------------------------------------------------------------------------------------------
 */
/* GPIO */
#if (_NETCHIP_ <= W5500)
#define PIN_INT 21
#elif (_NETCHIP_ == W6100)
#define PIN_INT 22
#elif (_NETCHIP_ == W6300)
#define PIN_INT 15
#endif

/**
 * ----------------------------------------------------------------------------------------------------
 * Functions
 * ----------------------------------------------------------------------------------------------------
 */
/* GPIO */
/*! \brief Initialize ethchip gpio interrupt callback function
 *  \ingroup ethchip_gpio_irq
 *
 *  Add a ethchip interrupt callback.
 *
 *  \param socket socket number
 *  \param callback the gpio interrupt callback function
 */
void ethchip_gpio_interrupt_initialize(uint8_t socket, void (*callback)(void));

/*! \brief Assign gpio interrupt callback function
 *  \ingroup ethchip_gpio_irq
 *
 *  GPIO interrupt callback function.
 *
 *  \param gpio Which GPIO caused this interrupt
 *  \param events Which events caused this interrupt. See \ref gpio_set_irq_enabled for details.
 */
static void ethchip_gpio_interrupt_callback(uint gpio, uint32_t events);

#endif /* _NETCHIP_GPIO_IRQ_H_ */
